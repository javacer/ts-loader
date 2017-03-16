"use strict";
var path = require("path");
var utils = require("./utils");
var constants = require("./constants");
/**
 * Make function which will manually update changed files
 */
function makeWatchRun(instance) {
    return function (watching, cb) {
        var watcher = watching.compiler.watchFileSystem.watcher ||
            watching.compiler.watchFileSystem.wfs.watcher;
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }
        Object.keys(watcher.getTimes())
            .filter(function (filePath) { return !!filePath.match(constants.tsTsxJsJsxRegex); })
            .forEach(function (filePath) {
            filePath = path.normalize(filePath);
            var file = instance.files[filePath];
            if (file) {
                file.text = utils.readFile(filePath) || '';
                file.version++;
                instance.version++;
                instance.modifiedFiles[filePath] = file;
            }
        });
        cb();
    };
}
module.exports = makeWatchRun;
