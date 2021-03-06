/*!
 * build-html.js
 * @author ydr.me
 * @create 2014年11月14日14:37:55
 */

'use strict';

var fs = require('fs-extra');
var path = require('path');
var howdo = require('howdo');
var log = require('../libs/log.js');
var sign = require('../libs/sign.js');
var dato = require('ydr-utils').dato;
var replaceHtml = require('../libs/replace-html.js');
var cssminify = require('../libs/cssminify.js');
var pathURI = require('../libs/path-uri.js');
var cssLength = 0;
var buildMap = {};


/**
 * 构建一个 HTML 文件
 * @param file {String} 源文件
 * @param callback {Function} 回调
 */
module.exports = function (file, callback) {
    var configs = global.configs;
    var cssPath = configs._cssPath;
    var jsBase = configs._jsBase;
    var srcPath = configs._srcPath;
    var destPath = configs._destPath;
    var depCSS = [];

    fs.readFile(file, 'utf8', function (err, code) {
        if (err) {
            log("read file", pathURI.toSystemPath(file), "error");
            log('read file', err.message, 'error');
            process.exit();
        }

        var ret = replaceHtml(file, code);

        //log('build html', pathURI.toSystemPath(file), 'warning');

        howdo
            // 生成 HTML 文件
            .task(function (doneHTML) {
                var relative = path.relative(srcPath, file);
                var destFile = path.join(destPath, relative);

                fs.outputFile(destFile, ret.code, function (err) {
                    if (err) {
                        log("write file", pathURI.toSystemPath(destFile), "error");
                        log('write file', err.message, 'error');
                        process.exit();
                    }

                    //log('√', pathURI.toSystemPath(destFile), 'success');
                    doneHTML();
                });
            })
            // 生成 css 文件
            .task(function (doneCSS) {
                // 读取多个替换
                howdo.each(ret.concat, function (index, matched, nextCSSFile) {
                    var bufferList = [];
                    var map = {};
                    var depURLs = matched.files.map(function (file) {
                        return pathURI.toURIPath(path.relative(srcPath, file));
                    });
                    var url = pathURI.toURIPath(matched.file);

                    map[url] = depURLs;
                    depCSS.push(map);

                    // 重复的css文件依赖 || 重复构建
                    if (matched.isRepeat || buildMap[matched.name]) {
                        return nextCSSFile();
                    }

                    buildMap[matched.name] = true;

                    var relative = path.relative(srcPath, cssPath);
                    var destFile = path.join(destPath, relative, matched.name);

                    // 合并多个文件
                    howdo.each(matched.files, function (index, file, doneConcat) {
                        cssLength++;

                        fs.readFile(file, 'utf8', function (err, code) {
                            if (err) {
                                log("read file", pathURI.toSystemPath(file), "error");
                                log('read file', err.message, 'error');
                                process.exit();
                            }

                            cssminify(file, code, destFile, function (err, code) {
                                bufferList.push(new Buffer('\n' + code, 'utf8'));
                                //log('require', pathURI.toSystemPath(file));
                                doneConcat();
                            });
                        });
                    }).follow(function () {
                        var code = Buffer.concat(bufferList).toString();

                        code = sign('css') + code;
                        fs.outputFile(destFile, code, function (err) {
                            if (err) {
                                log("write file", pathURI.toSystemPath(destFile), "error");
                                log('write file', err.message, 'error');
                                process.exit();
                            }

                            log('√', pathURI.toSystemPath(destFile), 'success');
                            nextCSSFile();
                        });
                    });
                }).follow(function () {
                    doneCSS();
                });
            })
            // 并行
            .together(function () {
                callback(null, cssLength, depCSS, ret.mainJS);
            });
    });
};