"use strict";
var path = require("path");
var loaderUtils = require("loader-utils");
require('colors');
var instances = require("./instances");
var utils = require("./utils");
var constants = require("./constants");
var webpackInstances = [];
var loaderOptionsCache = {};
/**
 * The entry point for ts-loader
 */
function loader(contents) {
    this.cacheable && this.cacheable();
    var callback = this.async();
    var options = getLoaderOptions(this);
    var _a = instances.getTypeScriptInstance(options, this), instance = _a.instance, error = _a.error;
    if (error) {
        callback(error);
        return;
    }
    var rawFilePath = path.normalize(this.resourcePath);
    var filePath = utils.appendTsSuffixIfMatch(options.appendTsSuffixTo, rawFilePath);
    var fileVersion = updateFileInCache(filePath, contents, instance);
    var _b = options.transpileOnly
        ? getTranspilationEmit(filePath, contents, instance, this)
        : getEmit(filePath, instance, this), outputText = _b.outputText, sourceMapText = _b.sourceMapText;
    if (outputText === null || outputText === undefined) {
        var additionalGuidance = filePath.indexOf('node_modules') !== -1
            ? "\nYou should not need to recompile .ts files in node_modules.\nPlease contact the package author to advise them to use --declaration --outDir.\nMore https://github.com/Microsoft/TypeScript/issues/12358"
            : "";
        throw new Error("Typescript emitted no output for " + filePath + "." + additionalGuidance);
    }
    var _c = makeSourceMap(sourceMapText, outputText, filePath, contents, this), sourceMap = _c.sourceMap, output = _c.output;
    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = fileVersion;
    callback(null, output, sourceMap);
}
/**
 * either retrieves loader options from the cache
 * or creates them, adds them to the cache and returns
 */
function getLoaderOptions(loader) {
    // differentiate the TypeScript instance based on the webpack instance
    var webpackIndex = webpackInstances.indexOf(loader._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(loader._compiler) - 1;
    }
    var queryOptions = loaderUtils.getOptions(loader) || {};
    var configFileOptions = loader.options.ts || {};
    var instanceName = webpackIndex + '_' + (queryOptions.instance || configFileOptions.instance || 'default');
    if (utils.hasOwnProperty(loaderOptionsCache, instanceName)) {
        return loaderOptionsCache[instanceName];
    }
    var options = Object.assign({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: false,
        visualStudioErrorFormat: false,
        compilerOptions: {},
        appendTsSuffixTo: [],
        entryFileIsJs: false,
        webStormErrorFormat: false,
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = utils.arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();
    options.instance = instanceName;
    loaderOptionsCache[instanceName] = options;
    return options;
}
/**
 * Either add file to the overall files cache or update it in the cache when the file contents have changed
 * Also add the file to the modified files
 */
function updateFileInCache(filePath, contents, instance) {
    // Update file contents
    var file = instance.files[filePath];
    if (!file) {
        file = instance.files[filePath] = { version: 0 };
    }
    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version++;
    }
    // push this file to modified files hash.
    if (!instance.modifiedFiles) {
        instance.modifiedFiles = {};
    }
    instance.modifiedFiles[filePath] = file;
    return file.version;
}
function getEmit(filePath, instance, loader) {
    // Emit Javascript
    var output = instance.languageService.getEmitOutput(filePath);
    loader.clearDependencies();
    loader.addDependency(filePath);
    var allDefinitionFiles = Object.keys(instance.files).filter(function (defFilePath) { return !!defFilePath.match(constants.dtsDtsxRegex); });
    // Make this file dependent on *all* definition files in the program
    var addDependency = loader.addDependency.bind(loader);
    allDefinitionFiles.forEach(addDependency);
    /* - alternative approach to the below which is more correct but has a heavy performance cost
         see https://github.com/TypeStrong/ts-loader/issues/393
         with this approach constEnumReExportWatch test will pass; without it, not.

    // Additionally make this file dependent on all imported files as well
    // as any deeper recursive dependencies
    const additionalDependencies = utils.collectAllDependencies(instance.dependencyGraph, filePath);
    */
    // Additionally make this file dependent on all imported files
    var additionalDependencies = instance.dependencyGraph[filePath];
    if (additionalDependencies) {
        additionalDependencies.forEach(addDependency);
    }
    loader._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
        .concat(additionalDependencies)
        .map(function (defFilePath) { return defFilePath + '@' + (instance.files[defFilePath] || { version: '?' }).version; });
    var outputFile = output.outputFiles.filter(function (outputFile) { return !!outputFile.name.match(constants.jsJsx); }).pop();
    var outputText = (outputFile) ? outputFile.text : undefined;
    var sourceMapFile = output.outputFiles.filter(function (outputFile) { return !!outputFile.name.match(constants.jsJsxMap); }).pop();
    var sourceMapText = (sourceMapFile) ? sourceMapFile.text : undefined;
    return { outputText: outputText, sourceMapText: sourceMapText };
}
/**
 * Transpile file
 */
function getTranspilationEmit(filePath, contents, instance, loader) {
    var fileName = path.basename(filePath);
    var _a = instance.compiler.transpileModule(contents, {
        compilerOptions: instance.compilerOptions,
        reportDiagnostics: true,
        fileName: fileName,
    }), outputText = _a.outputText, sourceMapText = _a.sourceMapText, diagnostics = _a.diagnostics;
    utils.registerWebpackErrors(loader._module.errors, utils.formatErrors(diagnostics, instance.loaderOptions, instance.compiler, { module: loader._module }));
    return { outputText: outputText, sourceMapText: sourceMapText };
}
function makeSourceMap(sourceMapText, outputText, filePath, contents, loader) {
    if (!sourceMapText) {
        return { output: outputText, sourceMap: undefined };
    }
    return {
        output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
        sourceMap: Object.assign(JSON.parse(sourceMapText), {
            sources: [loaderUtils.getRemainingRequest(loader)],
            file: filePath,
            sourcesContent: [contents]
        })
    };
}
module.exports = loader;
