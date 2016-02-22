#!/usr/bin/env node  
var server = require("../lib/server");
var version = "0.0.7";

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

new commander().bind("v", "show version", null, function () {
    console.log('version is ' + version);
}).bind("version", "show version", null, function () {
    console.log('version is ' + version);
}).bind("h", "help", null, function () {
    this.showDesc();
}).bind("help", "help", null, function () {
    this.showDesc();
}).bind("s", "start server", null, function () {
    server.run();
}).bind("start", "start server", null, function () {
    server.run();
}).bind("stop", "stop server", null, function () {
    server.stop();
}).bind("c", "create project with a projectName and its local file path", "<projectName>,<projectPath>", function (projectName, projectPath) {
    if (projectName && projectPath) {
        server.create(projectName, projectPath);
    } else {
        console.log("parameter error.first parameter is project name,the other is project path");
    }
}).bind("create", "create project with a projectName and its local file path", "<projectName>,<projectPath>", function (projectName, projectPath) {
    if (projectName && projectPath) {
        server.create(projectName, projectPath);
    } else {
        console.log("parameter error.first parameter is project name,the other is project path");
    }
}).bind("r", "remove porject with projectName", "<projectName>", function (projectName) {
    if (projectName) {
        server.remove(projectName);
    } else {
        console.log("[corgiserver] you must input a projectName");
    }
}).bind("remove", "remove porject with projectName", "<projectName>", function (projectName) {
    if (projectName) {
        server.remove(projectName);
    } else {
        console.log("[corgiserver] you must input a projectName");
    }
}).bind("restart", "restart server", null, function () {
    server.restart();
}).bind("ls", "list all the projects", null, function () {
    server.scan().done(function(data){
        console.log("[corgiserver] project list:");
        data.forEach(function(a){
            console.log("    <"+a+">");
        });
    });
}).bind("scan", "list all the projects", null, function () {
    server.scan().done(function(data){
        console.log("[corgiserver] project list:");
        data.forEach(function(a){
            console.log("    <"+a+">");
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
}).bind("state", "show corgiserver state", null, function () {
    console.log("[corgiserver] server state:");
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
    });
}).bind("encache", "enable to cache csp", null, function () {
    server.enableCspCache().done(function () {
        console.log("[corgiserver] enableed csp cache.");
    });
}).bind("discache", "disable to cache csp", null, function () {
    server.disableCspCache().done(function () {
        console.log("[corgiserver] disabled csp cache.");
    });
}).call(process.argv.slice(2));