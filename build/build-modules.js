/*!
 * build-modules.js
 * @author ydr.me
 * @create 2014-10-23 22:11
 */


'use strict';

var fs = require('fs-extra');
var howdo = require('howdo');
var path = require('path');
var glob = require('glob');
var log = require('../libs/log.js');
var dato = require('ydr-utils').dato;
var pathURI = require("../libs/path-uri.js");
var encryption = require('ydr-utils').encryption;
var replaceConfig = require('../libs/replace-config.js');
var replaceVersion = require('../libs/replace-version.js');
var parseConfig = require('../libs/parse-config.js');
var pathURI = require('../libs/path-uri.js');
var buildMain = require('./build-main.js');
var buildHTML = require('./build-html.js');


module.exports = function (srcPath) {
    /**
     * @prototype js
     * @prototype js.src
     * @prototype js["coolie.js"]
     * @prototype js["coolie-config.js"]
     * @prototype css
     * @prototype css.src
     * @prototype css.host
     * @prototype html
     * @prototype html.src
     * @prototype html.minify
     * @prototype resource
     * @prototype resource.src
     * @prototype resource.dest
     * @prototype dest
     * @prototype copy
     * @type {object}
     */
    var configs = parseConfig(srcPath);
    var destPath = path.join(srcPath, configs.dest.dirname);
    var cssPath = path.join(srcPath, configs.css.dest);
    var coolieConfigJSPath = path.join(srcPath, configs.js['coolie-config.js']);

    configs._srcPath = srcPath;
    configs._destPath = destPath;
    configs._cssPath = cssPath;
    configs._coolieConfigJSPath = coolieConfigJSPath;
    configs._coolieConfigJSURI = path.relative(srcPath, coolieConfigJSPath);
    global.configs = configs;

    //return console.log(JSON.stringify(configs, null, 2));

    var time = Date.now();
    var copyLength = 0;
    var mainLength = 0;
    var htmlLength = 0;
    var cssLength = 0;
    var versionMap = {};
    var mainRelationshipMap = {};
    var htmlJsCssRelationshipMap = {};

    howdo
        .task(function (next) {
            log('1/5', 'copy files', 'task');
            next();
        })
        .each(configs.copy, function (i, copyFile, nextCopy) {
            // copy files
            var gbPath = path.join(srcPath, copyFile);

            glob(gbPath, {dot: false, nodir: true}, function (err, files) {
                if (err) {
                    log('glob', pathURI.toSystemPath(gbPath), 'error');
                    log('glob', err.message, 'error');
                    process.exit();
                }

                howdo.each(files, function (j, file, nextFile) {
                    var relative = path.relative(srcPath, file);
                    var destFile = path.join(destPath, relative);

                    if (!path.relative(file, destFile)) {
                        return nextFile();
                    }

                    fs.copy(file, destFile, function (err) {
                        if (err) {
                            log('copy from', pathURI.toSystemPath(file), 'error');
                            log('copy to', pathURI.toSystemPath(destFile), 'error');
                            log('copy error', err.message, 'error');
                            process.exit();
                        }

                        //log('√', pathURI.toSystemPath(destFile), 'success');
                        copyLength++;
                        nextFile();
                    });
                }).follow(function () {
                    log('√', pathURI.toSystemPath(gbPath), 'success');
                    nextCopy();
                });
            });
        })

        .task(function (next) {
            log('2/5', 'build main', 'task');
            next();
        })
        .each(configs.js.src, function (i, main, nextMain) {
            // 构建入口模块
            var gbPath = path.join(srcPath, main);

            //log('build js', pathURI.toSystemPath(gbPath));

            glob(gbPath, {dot: false, nodir: true}, function (err, files) {
                if (err) {
                    log('glob', pathURI.toSystemPath(gbPath), 'error');
                    log('glob', err.message, 'error');
                    process.exit();
                }

                howdo.each(files, function (j, file, nextFile) {
                    var relative = path.relative(srcPath, file);

                    buildMain(file, function (err, code, md5List, deepDeps) {
                        if (err) {
                            return;
                        }

                        mainRelationshipMap[pathURI.toURIPath(relative)] = deepDeps.map(function (dep) {
                            return pathURI.toURIPath(path.relative(srcPath, dep));
                        });

                        var md5Version = encryption.md5(md5List).slice(0, 16);
                        var destFile = path.join(destPath, relative);

                        destFile = replaceVersion(destFile, md5Version);
                        versionMap[pathURI.toURIPath(relative)] = md5Version;

                        fs.outputFile(destFile, code, function (err) {
                            if (err) {
                                log('write file', pathURI.toSystemPath(destFile), 'error');
                                log('write file', err.message, 'error');
                                process.exit();
                            }

                            //log('√', pathURI.toSystemPath(destFile), 'success');
                            mainLength++;
                            nextFile();
                        });
                    });
                }).follow(function () {
                    nextMain();
                });
            });
        })

        .task(function (next) {
            log('3/5', 'overwrite config', 'task');
            next();
        })
        .task(function (next) {
            // 覆盖生成 coolie-config.js
            var code = fs.readFileSync(coolieConfigJSPath, 'utf8');
            var relative = path.relative(srcPath, coolieConfigJSPath);
            var coolieInfo = replaceConfig(code, versionMap);
            var destFile = path.join(destPath, relative);

            destFile = replaceVersion(destFile, coolieInfo.version);
            configs._coolieConfigVersion = coolieInfo.version;
            configs._jsBase = path.join(srcPath, path.dirname(configs.js['coolie-config.js']), coolieInfo.config.base);
            fs.outputFile(destFile, coolieInfo.code, function (err) {
                if (err) {
                    log('overwrite config', pathURI.toSystemPath(destFile), 'error');
                    log('overwrite config', err.message, 'error');
                    process.exit();
                }

                log('√', pathURI.toSystemPath(destFile), 'success');
                next();
            });
        })

        .task(function (next) {
            log('4/5', 'build html css', 'task');
            next();
        })
        .each(configs.html.src, function (i, htmlFile, nextGlob) {
            var gbPath = path.join(srcPath, htmlFile);

            glob(gbPath, {dot: false, nodir: true}, function (err, htmls) {
                if (err) {
                    log('glob', pathURI.toSystemPath(gbPath), 'error');
                    log('glob', err.message, 'error');
                    process.exit();
                }

                howdo.each(htmls, function (j, file, nextHTML) {
                    htmlLength++;

                    buildHTML(file, function (err, _cssLength, depCSS, mainJS) {
                        var htmlRelative = path.relative(srcPath, file);
                        var url = pathURI.toURIPath(htmlRelative);

                        htmlJsCssRelationshipMap[url] = {
                            css: depCSS,
                            main: mainJS
                        };
                        cssLength += _cssLength;
                        nextHTML(err);
                    });
                }).follow(function () {
                    log('√', pathURI.toSystemPath(gbPath), 'success');

                    nextGlob();
                });
            });
        })

        .task(function (next) {
            log('5/5', 'generator relationship map', 'task');
            next();
        })
        .task(function (next) {
            dato.each(htmlJsCssRelationshipMap, function (key, item) {
                if (mainRelationshipMap[item.main]) {
                    item.deps = mainRelationshipMap[item.main];
                } else if (item.main) {
                    log('miss main', item.main, 'error');
                    item.deps = [];
                }
            });

            var mapFile = path.join(destPath, './relationship-map.json');
            var data = JSON.stringify(htmlJsCssRelationshipMap, null, 4);

            fs.outputFile(mapFile, data, function (err) {
                if (err) {
                    log('write file', pathURI.toSystemPath(mapFile), 'error');
                    log('write file', err.message, 'error');
                    return process.exit();
                }

                log('√', pathURI.toSystemPath(mapFile), 'success');
                next();
            });
        })

        // 异步串行结束
        .follow(function (err) {
            if (err) {
                log('build error', err.message, 'error');
                return process.exit();
            }

            var past = Date.now() - time;

            console.log('');
            log('build success',
                'copy ' + copyLength + ' file(s), ' +
                '\nbuild ' + mainLength + ' js file(s), ' +
                '\nbuild ' + htmlLength + ' html file(s), ' +
                '\nbuild ' + cssLength + ' css file(s), ' +
                '\nbuild ' + Object.keys(configs._resVerMap).length + ' resource file(s), ' +
                '\npast ' + past + ' ms', 'success');
        });
};
