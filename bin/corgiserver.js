#!/usr/bin/env node  
var fs = require("fs");
var topolr = require("./topolr");
var server = require("./server");
var ipc = require("./util/ipc");
var ipconfig = require("../conf/server.json").ipc;
var logconfig = require("../conf/server.json").log;

var commander = function () {
    this._commands = {};
};
commander.blank = function (t) {
    var m = "";
    for (var i = 0; i < t; i++) {
        m += " ";
    }
    return m;
};
commander.prototype.bind = function (command, desc, paras, fn) {
    this._commands[command] = {
        name: command,
        desc: desc,
        fn: fn,
        paras: paras
    };
    return this;
};
commander.prototype.call = function (parameter) {
    var command = parameter[0];
    parameter.splice(0, 1);
    if (this._commands[command]) {
        this._commands[command].fn.apply(this, parameter);
    } else {
        this.showDesc();
    }
};
commander.prototype.showDesc = function () {
    console.log("Useage:");
    var leg = 0;
    for (var i in this._commands) {
        var info = this._commands[i];
        if (info.name.length > leg) {
            leg = info.name.length;
        }
    }
    leg = leg + 6;
    for (var i in this._commands) {
        var info = this._commands[i], t = [];
        if (info.paras) {
            console.log("   " + info.name + (info.paras ? ":" + info.paras : ""));
            console.log("   " + commander.blank(leg) + info.desc);
        } else {
            console.log("   " + info.name + commander.blank(leg - info.name.length) + info.desc);
        }
    }
};

var actions = {
    installProjects: function (projectName, localFolder, zipPath, fn) {
        console.log("[corgiserver] download the zip file <" + zipPath + ">");
        var zip = require("zip"), request = require('request'), path = "";
        localFolder = (localFolder + "/").replace(/[\/]+/g, "/");
        topolr.file(localFolder + "/_cache_.zip").write("").done(function () {
            var ws = fs.createWriteStream(localFolder + '/_cache_.zip');
            request(zipPath).on('response', function (response) {
                var total = response.headers['content-length'] || "", nowis = 0, isend = false;
                response.on('data', function (data) {
                    if (total != "") {
                        nowis += data.length;
                        var persent = Math.round((nowis / total) * 100);
                        if (!isend) {
                            process.stdout.clearLine();
                            process.stdout.cursorTo(0);
                            process.stdout.write('     Downloading... ' + persent + '%');
                        }
                        if (persent === 100 && isend === false) {
                            process.stdout.write("\n");
                            isend = true;
                        }
                    } else {
                        console.log("     Download...");
                    }
                });
            }).on('error', function (err) {
                console.error("[corgiserver] download zip file error");
            }).pipe(ws);
            ws.on('finish', function () {
                console.log("[corgiserver] zip download success.Now release the files");
                var data = fs.readFileSync(localFolder + '/_cache_.zip');
                var files = [];
                zip.Reader(data).forEach(function (entry) {
                    if (entry.isFile()) {
                        if (entry.getName().indexOf("package.json") !== -1 && path === "") {
                            path = localFolder + entry.getName();
                        }
                        files.push({
                            path: localFolder + entry.getName(),
                            data: entry.getData()
                        });
                    }
                });
                topolr.file(localFolder + '/_cache_.zip').remove();
                if (path !== "") {
                    var qe = topolr.queue(), isend = false;
                    qe.progress(function (a) {
                        var persent = Math.round((a.runed / a.total) * 100);
                        if (!isend) {
                            process.stdout.clearLine();
                            process.stdout.cursorTo(0);
                            process.stdout.write('     Release... ' + persent + '%');
                        }
                        if (persent === 100 && isend === false) {
                            process.stdout.write("\n");
                            isend = true;
                        }
                    });
                    qe.complete(function () {
                        console.log("[corgiserver] release ok,install the project");
                        console.log("     Building...");
                        var q = path.split("/");
                        q.splice(q.length - 1, 1);
                        q = q.join("/");
                        var options = {
                            encoding: 'utf8',
                            timeout: 0,
                            maxBuffer: 200 * 1024,
                            killSignal: 'SIGTERM',
                            setsid: false,
                            cwd: q,
                            env: null
                        };
                        var cp = require('child_process');
                        cp.exec('npm install', options, function (e, stdout, stderr) {
                            console.log("[corgiserver] install the project end.");
                            fn && fn(q);
                        });
                    });
                    files.forEach(function (a) {
                        qe.add(function () {
                            var ths = this;
                            topolr.file(a.path).write(a.data).done(function () {
                                ths.next();
                            });
                        });
                    });
                    qe.run();
                } else {
                    console.log("[corgiserver] the zip file is not a corgiserver project.");
                }
            });
        });
    },
    updateProjects: function (projectname) {
        server.getRemoteProjects().done(function (p) {
            console.log("[corgiserver] now update projects");
            var q = [];
            if (projectname) {
                for (var i in p) {
                    if (p[i].name === projectname) {
                        q.push(p[i]);
                    }
                }
            } else {
                q = p;
            }
            for (var i in q) {
                console.log("    <" + q[i].name + ">");
            }
            var qe = topolr.queue();
            qe.complete(function () {
                console.log("");
                console.log("[corgiserver] update all projects success.now you can restart the server.");
            });
            q.forEach(function (a) {
                qe.add(function () {
                    console.log("");
                    console.log("[corgiserver] now update project <" + a.name + ">");
                    actions.installProjects(a.name, a.installPath, a.remotePath, function () {
                        console.log("[corgiserver] project <" + a.name + "> updated.");
                        this.next();
                    }.bind(this));
                });
            });
            qe.run();
        });
    },
    checkDaemonThenData: function (type, data) {
        var ps = topolr.promise();
        var t = topolr.extend({}, ipconfig, {reconnect: false});
        ipc(t).on("data", function (data, conn, server) {
            if (data.type === "check") {
                if (type) {
                    conn.write({
                        type: type,
                        data: data || {}
                    });
                } else {
                    setTimeout(function () {
                        conn.end();
                        conn.unref();
                        ps.resolve();
                    }, 0);
                }
            } else if (data.type === type) {
                setTimeout(function () {
                    conn.end();
                    conn.unref();
                    ps.resolve(data.code);
                }, 0);
            } else {
                setTimeout(function () {
                    conn.end();
                    conn.unref();
                    ps.resolve();
                }, 0);
            }
        }).on('connect', function (conn) {
            conn.write({
                type: "check",
                data: {}
            });
        }).on("error", function () {
            ps.reject();
        }).connect();
        return ps;
    },
    checkDaemonWhenData: function (type, data) {
        var t = topolr.extend({}, ipconfig, {reconnect: false}), ps = topolr.promise();
        ipc(t).on("data", function (data, conn, server) {
            if (data.type === "check") {
                conn.write({
                    type: type,
                    data: data || {}
                });
            } else if (data.type === type) {
                if (data.code === "goon") {
                    conn.write({
                        type: type,
                        data: data || {}
                    });
                } else {
                    setTimeout(function () {
                        ps.resolve(data.code);
                        conn.end();
                        conn.unref();
                    }, 0);
                }
            } else {
                setTimeout(function () {
                    conn.end();
                    conn.unref();
                    ps.resolve();
                }, 0);
            }
        }).on('connect', function (conn) {
            conn.write({
                type: "check",
                data: {}
            });
        }).on("error", function (e) {
            ps.reject();
        }).connect();
        return ps;
    },
    startServer: function () {
        try {
            actions.checkDaemonThenData("startserver").done(function () {
                console.log("[corgiserver] server is already started.");
            }).fail(function () {
                actions.startDaemon();
                console.log("[corgiserver] server is started.");
            }).always(function () {
                process.exit(0);
            });
        } catch (e) {
            console.log(e);
        }
    },
    stopServer: function () {
        actions.checkDaemonThenData("stopserver").done(function () {
            console.log("[corgiserver] server is stopped.");
        }).fail(function () {
            console.log("[corgiserver] server is not started.start the server first.");
        }).always(function () {
            process.exit(0);
        });
    },
    restartServer: function () {
        actions.checkDaemonThenData("restartserver").done(function () {
            console.log("[corgiserver] server is restarted.");
        }).fail(function () {
            actions.startDaemon();
            console.log("[corgiserver] server is stated.");
        }).always(function () {
            process.exit(0);
        });
    },
    stopDaemon: function () {
        actions.checkDaemonThenData("stopprocess").done(function () {
            console.log("[corgiserver] corgiserver service is stopped.");
        }).fail(function () {
            console.log("[corgiserver] corgiserver service is not started.daemon process is not running.");
        }).always(function () {
            process.exit(0);
        });
    },
    restartDaemon: function () {
        actions.checkDaemonThenData("stopprocess").done(function () {
            actions.startDaemon();
            console.log("[corgiserver] corgiserver service is restated.");
        }).fail(function () {
            console.log("[corgiserver] corgiserver service is running,stop it...");
            actions.startDaemon();
            console.log("[corgiserver] corgiserver service is restated.");
        }).always(function () {
            process.exit(0);
        });
    },
    daemonid: function () {
        actions.checkDaemonThenData("daemonid").done(function (a) {
            console.log("[corgiserver] corgiserver service pid is " + a);
        }).fail(function () {
            console.log("[corgiserver] server is not started.start the server first.");
        }).always(function () {
            process.exit(0);
        });
    },
    startDaemon: function () {
        var p = topolr.path(__dirname).parent().path(), t = logconfig.daemon;
        if (!logconfig.daemon) {
            t = p + "log/log.log";
        } else {
            if (logconfig.daemon[0] !== "/" && logconfig.daemon.indexOf(":") === -1) {
                t = p + logconfig.daemon;
            }
        }
        topolr.file(t).write("");
        try {
            var server = require('child_process').spawn('node', [p + './bin/daemon.js'], {
                detached: true,
                stdio: ['ignore', fs.openSync(t, 'a'), fs.openSync(t, 'a')]
            });
            server.on("error", function (e) {
                console.log(e);
            });
            server.unref();
        } catch (e) {
            console.log(e.stack);
        }
        console.log('[corgiserver] corgiserver service is started.daemon process pid:' + server.pid);
    },
    getServerInfo: function () {
        actions.checkDaemonWhenData("getserverinfo").done(function (a) {
            if (a !== "noservice") {
                a = a.data;
                console.log("");
                console.log("        corgiserver status:");
                console.log("");
                console.log("            PID :" + " " + a.pid);
                console.log("  ------------------------------");
                console.log("           arch :" + " " + a.arch);
                console.log("  ------------------------------");
                console.log("       platform :" + " " + a.platform);
                console.log("  ------------------------------");
                console.log("            rss :" + " " + (a.memory.rss / (1024 * 1024)).toFixed(2) + "M");
                console.log("  ------------------------------");
                console.log("       heapUsed :" + " " + (a.memory.heapUsed / (1024 * 1024)).toFixed(2) + "M");
                console.log("  ------------------------------");
                console.log("      heapTotal :" + " " + (a.memory.heapTotal / (1024 * 1024)).toFixed(2) + "M");
                console.log("");
            } else {
                console.log("[corgiserver] server is not started.start it first.");
            }
        }).fail(function () {
            console.log("[corgiserver] server is not started.start the server first.");
        }).always(function () {
            process.exit(0);
        });
    }
};

new commander().bind("version", "show version", null, function () {
    console.log('version is ' + server.version());
}).bind("run", "just start without deamon process", null, function () {
    require("./server").run();
}).bind("?", "help", null, function () {
    this.showDesc();
}).bind("help", "help", null, function () {
    this.showDesc();
}).bind("restart", "restart server", null, function () {
    actions.restartServer();
}).bind("start", "start server", null, function () {
    actions.startServer();
}).bind("stop", "close all corgiserver service", null, function () {
    actions.stopDaemon();
}).bind("status", "show the server running status.", null, function () {
    actions.getServerInfo();
}).bind("create", "create project with a projectName and its local file path", "<projectName>,<projectPath>", function (projectName, projectPath) {
    if (projectName && projectPath) {
        server.create(projectName, projectPath);
    } else {
        console.log("parameter error.first parameter is project name,the other is project path");
    }
}).bind("daemonpid", "show the daemon process id", null, function () {
    actions.daemonid();
}).bind("remove", "remove porject with projectName", "<projectName>", function (projectName) {
    if (projectName) {
        server.remove(projectName);
    } else {
        console.log("[corgiserver] you must input a projectName");
    }
}).bind("ls", "list all the projects", null, function () {
    server.scan().done(function (data) {
        console.log("[corgiserver] project list:");
        data.forEach(function (a) {
            console.log("    <" + a.name + ">      <" + a.path + ">     <" + (a.remotePath ? a.remotePath : "no path") + ">    <" + (a.installPath ? a.installPath : "no path") + ">");
        });
    });
}).bind("sport", "set current port of corgiserver", "<port>", function () {
    var port = arguments[0];
    if (port) {
        server.setPort(port).done(function () {
            console.log("[corgiserver] server port is edited with " + port);
        });
    } else {
        console.log("[corgiserver] you must input a port");
    }
}).bind("ssessiontimeout", "set current session timeout of corgiserver", "<time>", function () {
    var time = arguments[0];
    if (time) {
        server.setSessionTimeout(time).done(function () {
            console.log("[corgiserver] server session timeout is edited with " + time);
        });
    } else {
        console.log("[corgiserver] you must input session timeout time");
    }
}).bind("info", "show corgiserver info", null, function () {
    console.log("");
    console.log("   corgiserver info:");
    console.log("");
    server.getServerState().done(function (data) {
        var t = 0;
        for (var i in data) {
            if (i.length > t) {
                t = i.length;
            }
        }
        t = t + 6;
        for (var i in data) {
            console.log("    " + i + commander.blank(t - i.length) + data[i]);
        }
        console.log("");
    });
}).bind("encache", "enable to cache csp", null, function () {
    server.enableCspCache().done(function () {
        console.log("[corgiserver] enableed csp cache.");
    });
}).bind("discache", "disable to cache csp", null, function () {
    server.disableCspCache().done(function () {
        console.log("[corgiserver] disabled csp cache.");
    });
}).bind("remoteprojects", "list all remote projects", null, function () {
    server.getRemoteProjects().done(function (a) {
        a.forEach(function (b) {
            console.log("      <" + b.name + ">" + "   <" + b.path + ">   <" + b.remotePath + ">");
        });
    });
}).bind("install", "install a website form a zip file", "<projectName>,<localFolder>,<zipPath>", function (projectName, localFolder, zipPath) {
    actions.installProjects(projectName, localFolder, zipPath, function (q) {
        server.create(projectName, q, zipPath, localFolder, function () {
            console.log("[corgiserver] now you can restart corgiserver...");
        });
    });
}).bind("update", "update all projects which has a romote path.", "[<projectName>]", function (projectname) {
    actions.updateProjects(projectname);
}).bind("updateremotepath", "update a project remote path.", "<projectName>,<zipPath>", function (projectName, zipPath) {
    if (projectName && zipPath) {
        server.editProjectRemotePath(projectName, zipPath);
    } else {
        console.log("[corgiserver] projectName,zipPath can not empty.");
    }
}).call(process.argv.slice(2));
process.on("uncaughtException", function (e) {
    console.log(e.stack);
});