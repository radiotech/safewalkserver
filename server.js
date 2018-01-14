var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var express = require('express');
var app = express();
var http = require('http').Server(app);
app.use(express.static('hosted'));
var maxUsers = 1000;
var nextUser = 0;
var idMap = {};
var users = [];
for (var i = 0; i < maxUsers; i++) {
    users[i] = undefined;
}
var State;
(function (State) {
    State[State["uNone"] = 0] = "uNone";
    State[State["uPending"] = 1] = "uPending";
    State[State["uRejected"] = 2] = "uRejected";
    State[State["uAccepted"] = 3] = "uAccepted";
    State[State["uWalking"] = 4] = "uWalking";
})(State || (State = {}));
var STATE = ["IDLE", "PENDING", "REJECTED", "ACCEPTED", "WALKING"];
var User = /** @class */ (function () {
    function User(fullname, pid, phone, admin) {
        this.active = true;
        this.fullname = fullname;
        this.pid = pid;
        this.phone = phone;
        this.username = (admin ? 'admin ' : 'user ') + pid + " (" + fullname + ")";
        this.admin = admin;
        this.state = State.uNone;
        this.walker = undefined;
        this.walkStart = undefined;
        this.walkEnd = undefined;
        this.message = 'an error occurred.';
        this.toWalk = [];
        users[nextUser++] = this;
        nextUser = nextUser % maxUsers;
    }
    User.login = function (fullname, pid, phone) {
        if (fullname == "") {
            console.log("Someone attempted to log in with an invalid name.");
            return { event: "badLogin", message: "Plese enter a valid name." };
        }
        if (!isUser(pid)) {
            console.log("Someone attempted to log in with an invalid pid.");
            return { event: "badLogin", message: "Plese enter a valid pid." };
        }
        if (phone == "") {
            console.log("Someone attempted to log in with an invalid phone number.");
            return { event: "badLogin", message: "Plese enter a valid phone number." };
        }
        var user = getUser(pid);
        if (user != undefined) {
            user.fullname = fullname;
            user.phone = phone;
            user.username = (user.admin ? 'admin ' : 'user ') + pid + " (" + fullname + ")";
        }
        else {
            user = isAdmin(pid) ? new Walker(fullname, pid, phone) : new Walkee(fullname, pid, phone);
        }
        var sessionID = genSessionID();
        idMap[sessionID] = user;
        console.log(user.username + " connected from IP ...:... with phone number " + user.phone);
        return { event: "login", id: sessionID };
    };
    return User;
}());
var Walker = /** @class */ (function (_super) {
    __extends(Walker, _super);
    function Walker(fullname, pid, phone) {
        return _super.call(this, fullname, pid, phone, true) || this;
    }
    Walker.prototype.getState = function () {
        var toAccept = undefined;
        for (var i = 0; i < this.toWalk.length; i++) {
            if (this.toWalk[i].state == State.uPending) {
                toAccept = this.toWalk[i];
                break;
            }
        }
        if (toAccept != undefined) {
            return { 'event': 'aReview', 'fullname': toAccept.fullname, 'pid': toAccept.pid, 'phone': toAccept.phone, 'walkStart': toAccept.walkStart, 'walkEnd': toAccept.walkEnd };
        }
        else if (this.toWalk.length == 0) {
            return { 'event': 'aNone' };
        }
        else if (this.toWalk[0].state == State.uAccepted) {
            console.log('x3');
            return { 'event': 'aBiking', 'fullname': this.toWalk[0].fullname, 'pid': this.toWalk[0].pid, 'phone': this.toWalk[0].phone, 'walkStart': this.toWalk[0].walkStart, 'time': '9' };
        }
        else {
            console.log('x4');
            return { 'event': 'aWalking', 'fullname': this.toWalk[0].fullname, 'pid': this.toWalk[0].pid, 'phone': this.toWalk[0].phone, 'walkEnd': this.toWalk[0].walkStart, 'time': '9' };
        }
    };
    Walker.prototype.aAccept = function (data) {
        var user = getUser(data.pid);
        if (user != undefined) {
            if (user.state == State.uPending) {
                console.log(this.username + " accepted a walk for " + user.username);
                user.state = State.uAccepted;
                user.walker = this;
            }
            else {
                console.log(this.username + " tried to accepted a walk for " + user.username + " but they were " + STATE[user.state]);
            }
        }
        else {
            console.log(this.username + ' accepted a walk for an invalid user (' + data.pid + ')');
        }
        return this.getState();
    };
    Walker.prototype.aReject = function (data) {
        var user = getUser(data.pid);
        if (user != undefined) {
            if (user.state == State.uPending) {
                console.log(this.username + " REJECTED a walk for " + user.username + ' because "' + data.message + '"');
                user.state = State.uRejected;
                user.message = "\"" + data.message + "\"";
            }
            else {
                console.log(this.username + " tried to reject a walk for " + user.username + " but they were " + STATE[user.state]);
            }
        }
        else {
            console.log(this.username + ' rejected a walk for an invalid user (' + data.pid + ')');
        }
        return this.getState();
    };
    Walker.prototype.aStart = function (data) {
        var user = getUser(data.pid);
        if (user != undefined) {
            if (user.state == State.uAccepted) {
                console.log(this.username + " started a walk with " + user.username);
                user.state = State.uWalking;
            }
            else {
                console.log(this.username + " tried to start a walk for " + user.username + " but they were " + STATE[user.state]);
            }
        }
        else {
            console.log(this.username + ' started a walk for an invalid user (' + data.pid + ')');
        }
        return this.getState();
    };
    Walker.prototype.aEnd = function (data) {
        var user = getUser(data.pid);
        if (user != undefined) {
            if (user.state == State.uWalking) {
                if (user.walker == this && user == this.toWalk[0]) {
                    console.log(this.username + " ended a walk for " + user.username);
                    user.state = State.uNone;
                }
                else {
                    console.log(this.username + " tried to end a walk for " + user.username + " but was not this user's assigned walker");
                }
            }
            else {
                console.log(this.username + " tried to end a walk for " + user.username + " but they were " + STATE[user.state]);
            }
        }
        else {
            console.log(this.username + ' ended a walk for an invalid user (' + data.pid + ')');
        }
        return this.getState();
    };
    return Walker;
}(User));
var Walkee = /** @class */ (function (_super) {
    __extends(Walkee, _super);
    function Walkee(fullname, pid, phone) {
        return _super.call(this, fullname, pid, phone, false) || this;
    }
    Walkee.prototype.getState = function () {
        switch (this.state) {
            case State.uNone:
                return { 'event': 'uNone', 'time': '9' };
            case State.uPending:
                return { 'event': 'uPending', 'time': '9' };
            case State.uRejected:
                return { 'event': 'uRejected', 'message': this.message };
            case State.uAccepted:
                console.log('x1');
                return { 'event': 'uAccepted', 'fullname': this.walker.fullname, 'phone': this.walker.phone, 'time': '9' };
            case State.uWalking:
                console.log('x2');
                return { 'event': 'uWalking', 'fullname': this.walker.fullname, 'phone': this.walker.phone, 'time': '9' };
        }
    };
    Walkee.prototype.uRequest = function (data) {
        if (data.walkStart != undefined && data.walkEnd != undefined) {
            if (this.state == State.uNone) {
                if (isWalker()) {
                    console.log(this.username + " requested a walk (" + JSON.stringify(data.walkStart) + " to " + JSON.stringify(data.walkEnd) + ")");
                    this.state = State.uPending;
                    this.walkStart = data.walkStart;
                    this.walkEnd = data.walkEnd;
                    this.walker = nextWalker(this.walkStart);
                }
                else {
                    console.log(this.username + " tried to request a walk but there are no available walkers");
                    this.state = State.uRejected;
                    this.message = 'there are no walkers online.';
                }
            }
            else {
                console.log(this.username + " tried to request a walk from an invalid state");
            }
        }
        else {
            console.log(this.username + ' requested a walk with invalid data (' + JSON.stringify(data) + ')');
        }
        return this.getState();
    };
    Walkee.prototype.uCancel = function (data) {
        if (this.state == State.uPending || this.state == State.uAccepted || this.state == State.uRejected) {
            console.log(this.username + " canceled their walk while " + STATE[this.state]);
            var tempWalker = this.walker;
            this.state = State.uNone;
        }
        else {
            console.log(this.username + " tried to cancel their walk but it does not exist");
        }
        return this.getState();
    };
    return Walkee;
}(User));
function isAdmin(pid) {
    return pid == '1' || pid == '2';
}
function isUser(pid) {
    if (/^[0-9]{9}$/.test(pid) || /^[0-9]{1}$/.test(pid) || /^[0-9]{2}$/.test(pid)) {
        //looks valid
        return true;
    }
    return false;
}
/*
function updateState(){
    for(var i = 0; i < maxUsers; i++){
        var user = users[i];
        if(user != undefined && user.active){
            //keep toWalk lists up to date
            if(user.admin){
                for(var j = 0; j < user.toWalk.length; j++){
                    if(user.toWalk[j].walker != user || (user.toWalk[j].state != State.uPending && user.toWalk[j].state != State.uAccepted && user.toWalk[j].state != State.uWalking)){
                        user.toWalk.splice(j,1);
                        j--;
                    }
                }
            } else {
                if(user.walker != undefined){
                    if(user.state == State.uPending || user.state == State.uAccepted || user.state == State.uWalking){
                        var isAdded = false;
                        for(var j = 0; j < user.walker.toWalk.length; j++){
                            if(user.walker.toWalk[j] == user){
                                isAdded = true;
                            }
                        }
                        if(!isAdded){
                            user.walker.toWalk.push(user);
                        }
                    } else {
                        user.walker = undefined;
                    }
                } else {
                    if(user.state == State.uPending || user.state == State.uAccepted || user.state == State.uWalking){
                        user.state = State.uRejected;
                        user.message = 'there was an error.';
                    }
                }
            }
        } else if(user != undefined && !user.active) {
            users[i] = undefined;
        }
    }
}

function updateStateRaw(user: User){
    if(user == undefined){
        for(var i = 0; i < maxUsers; i++){
            if(users[i] != undefined){
                updateStateRaw(users[i]);
            }
        }
    } else if(user.active){
        if(user.admin){
            var toAccept = undefined;
            for(var i = 0; i < user.toWalk.length; i++){
                if(user.toWalk[i].state == State.uPending){
                    toAccept = user.toWalk[i];
                    break;
                }
            }
            if(toAccept != undefined){
                user.socket.send(JSON.stringify({'event':'aReview','fullname':toAccept.fullname,'pid':toAccept.pid,'phone':toAccept.phone,'walkStart':toAccept.walkStart,'walkEnd':toAccept.walkEnd}));
            } else if(user.toWalk.length == 0){
                user.socket.send(JSON.stringify({'event':'aNone'}));
            } else if(user.toWalk[0].state == State.uAccepted) {
                console.log('x3');
                user.socket.send(JSON.stringify({'event':'aBiking','fullname':user.toWalk[0].fullname,'pid':user.toWalk[0].pid,'phone':user.toWalk[0].phone,'walkStart':user.toWalk[0].walkStart,'time':'9'}));
            } else {
                console.log('x4');
                user.socket.send(JSON.stringify({'event':'aWalking','fullname':user.toWalk[0].fullname,'pid':user.toWalk[0].pid,'phone':user.toWalk[0].phone,'walkEnd':user.toWalk[0].walkStart,'time':'9'}));
            }
        } else {
            switch(user.state){
                case State.uNone:
                    user.socket.send(JSON.stringify({'event':'uNone','time':'9'}));
                    break;
                case State.uPending:
                    user.socket.send(JSON.stringify({'event':'uPending','time':'9'}));
                    break;
                case State.uRejected:
                    user.socket.send(JSON.stringify({'event':'uRejected','message':user.message}));
                    break;
                case State.uAccepted:
                    console.log('x1');
                    user.socket.send(JSON.stringify({'event':'uAccepted','fullname':user.walker.fullname,'phone':user.walker.phone,'time':'9'}));
                    break;
                case State.uWalking:
                    console.log('x2');
                    user.socket.send(JSON.stringify({'event':'uWalking','fullname':user.walker.fullname,'phone':user.walker.phone,'time':'9'}));
                    break;
            }
        }
    }
}
*/
function getUser(pid) {
    for (var i = 0; i < maxUsers; i++) {
        if (users[i] != undefined && users[i].pid == pid) {
            return users[i];
        }
    }
    return undefined;
}
function isWalker() {
    for (var i = 0; i < maxUsers; i++) {
        if (users[i] != undefined && users[i].admin) {
            return true;
        }
    }
    return false;
}
function nextWalker(data) {
    for (var i = 0; i < maxUsers; i++) {
        if (users[i] != undefined && users[i].admin) {
            return users[i];
        }
    }
}
function getDis() {
    //https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&mode=walking&origins=35.9079876,-79.0480345&destinations=35.9081102,%20-79.0502256&key=AIzaSyAdF87T_v7G-XPdwRdCBjlHzyVm1mGRZA8
}
function genSessionID(id) {
    if (id === void 0) { id = ""; }
    var chars = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    id = id + chars.charAt(Math.floor(Math.random() * chars.length));
    return id.length < 16 ? genSessionID(id) : id;
}
app.use('/data', function (req, res, next) {
    var data = req.query;
    if (data.event != undefined) {
        if (data.id != undefined) {
            var user = idMap[data.id];
            if (user != undefined) {
                try {
                    res.send(JSON.stringify(user[data.event](data)));
                    return;
                }
                catch (e) {
                    console.log("could not process message data: \"" + JSON.stringify(data) + "\" because \"" + e.name + "\": \"" + e.message + "\"");
                }
            }
            else {
                console.log("Recieved a user request with invalid session id: \"" + data.id + "\"");
            }
        }
        else if (data.event == "login") {
            res.send(JSON.stringify(User.login(data.fullname || "", data.pid || "", data.phone || "")));
            return;
        }
        else {
            console.log("Recieved a message with an event but no session id: \"" + JSON.stringify(data) + "\"");
        }
    }
    else {
        console.log("Recieved a message without an event: \"" + JSON.stringify(data) + "\"");
    }
    res.send(JSON.stringify({ event: "badConnect" }));
});
var port = 8080;
http.listen(port, function () {
    console.log('SafeWalk server started on port ' + port);
});
