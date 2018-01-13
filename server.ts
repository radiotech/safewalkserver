const express = require('express');
const app = express();
const http = require('http').Server(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });
app.use(express.static('hosted'))

const maxUsers = 1000;
let nextUser = 0;
let users: User[] = [];

for(let i = 0; i < maxUsers; i++){
    users[i] = undefined;
}

enum State {uNone, uPending, uRejected, uAccepted, uWalking}

interface User {
    active: boolean; /*validity*/
    
    fullname: string; /*basic data*/
    pid: string;
    phone: string;
    id: string;
    socket: WS;
    admin: boolean;

    state?: State; /*user data*/
    walker?: User;
    walkStart?: Location;
    walkEnd?: Location;
    message?: string;

    toWalk?: User[]; /*admin data*/

    uRequest?: (Data) => void;
    uCancel?: (Data) => void;
    aReject?: (Data) => void;
    aAccept?: (Data) => void;
    aStart?: (Data) => void;
    aEnd?: (Data) => void;
}

class Walker implements User {
    active: boolean;
    fullname: string;
    pid: string;
    phone: string;
    id: string;
    socket: WS;
    admin: boolean;
    
    toWalk: User[];

    constructor(socket: WS, fullname: string, pid: string, phone: string){
        this.active = true;
        this.fullname = fullname;
        this.pid = pid;
        this.phone = phone;
        this.id = 'admin '+pid+" ("+fullname+")";
        this.socket = socket;
        this.admin = true;
        this.toWalk = [];
    }
}

class Walkee implements User {
    active: boolean;
    fullname: string;
    pid: string;
    phone: string;
    id: string;
    socket: WS;
    admin: boolean;
    
    state: State;
    walker: User;
    walkStart: Location;
    walkEnd: Location;
    message: string;

    constructor(socket: WS, fullname: string, pid: string, phone: string){
        this.active = true;
        this.fullname = fullname;
        this.pid = pid;
        this.phone = phone;
        this.id = 'user '+pid+" ("+fullname+")";
        this.socket = socket;
        this.admin = false;

        this.state = State.uNone;
        this.walker = undefined;
        this.walkStart = undefined;
        this.walkEnd = undefined;
        this.message = 'an error occurred.';
    }
}

interface Locaiton{
    x: number;
    y: number;
    z: number;
}
interface WS {
    onmessage: (message: Message) => void;
    onclose: (message: Message) => void;
    send: (message: string) => void;
    _socket: {remoteAddress,remotePort};
    user: User;
}
interface Message {
    data: string;
}
interface Data {
    event: string;
    fullname?: string;
    pid?: string;
    phone?: string;
    walkStart?: Location;
    walkEnd?: Location;
    time?: string;
    message?: string;
}

function isAdmin(pid: string){
    return pid=='1' || pid=='2';
}
function isUser(pid: string){
    return pid!='-1' && pid!='-2';
}

wss.on('connection', function(socket: WS){
    console.log("+");
    socket.onclose = function(message: Message){
        if(socket.user != undefined){
            socket.user.active = false;
            console.log(socket.user.id+" closed their connection to the server");
        }
        console.log("-");
    }
    socket.onmessage = function(message: Message){
        let data: Data = {'event': undefined};
        try{
            data = JSON.parse(message.data);
        } catch(e) {
            console.log('could not process message data: "'+message.data+'" ('+e.name+': '+e.message+')');
            return;
        }
        if(data.event == undefined){
            console.log((socket.user==undefined?('IP '+socket._socket.remoteAddress+':'+socket._socket.remotePort):(socket.user.id))+' sent a message without an event: "'+message.data+'"');
            return;
        }
        if(socket.user != undefined){
            try{
                socket.user[data.event](data);
            } catch(e) {
                console.log('could not process message data: "'+message.data+'" because "'+e.name+': '+e.message+'"');
                return;
            }
        } else {
            if(data.event=="login"){
                if(data.fullname == undefined || data.pid == undefined || data.phone == undefined){
                    console.log('IP '+socket._socket.remoteAddress+':'+socket._socket.remotePort+' made a bad login request with "'+message.data+'"');
                    socket.send(JSON.stringify({'event':'badLogin','message':'Bad login request format.'}));
                } else {
                    if(data.fullname == ""){
                        console.log('IP '+socket._socket.remoteAddress+':'+socket._socket.remotePort+' attempted to log in with an invalid name "'+message.data+'"');
                        socket.send(JSON.stringify({'event':'badLogin','message':'Invalid name.'}));
                    } else if(!isUser(data.pid)){
                        console.log('IP '+socket._socket.remoteAddress+':'+socket._socket.remotePort+' attempted to log in with an invalid name "'+message.data+'"');
                        socket.send(JSON.stringify({'event':'badLogin','message':'PID not found.'}));
                    } else if(data.phone == ""){
                        console.log('IP '+socket._socket.remoteAddress+':'+socket._socket.remotePort+' attempted to log in with an invalid name "'+message.data+'"');
                        socket.send(JSON.stringify({'event':'badLogin','message':'Invalid phone number.'}));
                    } else {
                        var user = findUser(data.pid);
                        if(user != undefined){
                            user.fullname = data.fullname;
                            user.phone = data.phone;
                            user.id = (data.fullname+" ["+data.pid+"]");
                            
                            user.socket = socket;
                            socket.user = user;
                            user.active = true;
                        } else {
                            user = isAdmin(data.pid)?new Walker(socket,data.fullname,data.pid,data.phone):new Walkee(socket,data.fullname,data.pid,data.phone);
                            users[nextUser] = user;
                            socket.user = user;
                            nextUser++;
                            if(nextUser>=maxUsers){
                                nextUser = 0;
                            }
                        }
                        if(user.admin){
                            setupAdmin(socket);
                        } else {
                            setupUser(socket);
                        }
                        console.log(user.id+" connected from IP "+socket._socket.remoteAddress+":"+socket._socket.remotePort+' with phone number '+user.phone);
                        updateState();
                        updateStateRaw(user);
                    }
                }
            }
        }
    };
});

function setupUser(socket: WS){
    socket.user.uRequest = function(data: Data){
        updateState();
        if(data.walkStart != undefined && data.walkEnd != undefined){
            if(socket.user.state == State.uNone){
                if(isWalker()){
                    console.log(socket.user.id+" requested a walk ("+JSON.stringify(data.walkStart)+" to "+JSON.stringify(data.walkEnd)+")");
                    socket.user.state = State.uPending;
                    socket.user.walkStart = data.walkStart;
                    socket.user.walkEnd = data.walkEnd;
                    socket.user.walker = nextWalker(socket.user.walkStart);
                    updateState();
                    updateStateRaw(socket.user);
                    updateStateRaw(socket.user.walker);
                } else {
                    console.log(socket.user.id+" tried to request a walk but there are no available walkers");
                    socket.user.state = State.uRejected;
                    socket.user.message = 'there are no walkers online.';
                    updateState();
                    updateStateRaw(socket.user);
                }
            } else {
                console.log(socket.user.id+" tried to request a walk from an invalid state");
            }
        } else {
            console.log(socket.user.id+' requested a walk with invalid data ('+JSON.stringify(data)+')');
        }
    };
    socket.user.uCancel = function(data: Data){
        updateState();
        if(socket.user.state == State.uPending || socket.user.state == State.uAccepted || socket.user.state == State.uRejected){
            console.log(socket.user.id+" canceled their walk");
            var tempWalker = socket.user.walker;
            socket.user.state = State.uNone;
            updateState();
            updateStateRaw(socket.user);
            updateStateRaw(tempWalker);
        } else {
            console.log(socket.user.id+" tried to cancel their walk but it does not exist");
        }
    };
}

function setupAdmin(socket: WS){
    socket.user.aAccept = function(data: Data){
        updateState();
        var user = findUser(data.pid);
        if(user != undefined){
            if(user.state == State.uPending){
                console.log(socket.user.id+" accepted a walk for user "+user.id);
                user.state = State.uAccepted;
                user.walker = socket.user;
                updateState();
                updateStateRaw(socket.user);
                updateStateRaw(user);
            } else {
                console.log(socket.user.id+" tried to accepted a walk for user "+user.id+" but it was removed or already accepted/rejected");
            }
        } else {
            console.log(socket.user.id+' accepted a walk for an invalid user ('+data.pid+')');
        }
    };
    socket.user.aReject = function(data: Data){
        updateState();
        var user = findUser(data.pid);
        if(user != undefined){
            if(user.state == State.uPending){
                console.log(socket.user.id+" REJECTED a walk for user "+user.id+' because "'+data.message+'"');
                user.state = State.uRejected;
                user.message = '"'+data.message+'"';
                updateState();
                updateStateRaw(socket.user);
                updateStateRaw(user);
            } else {
                console.log(socket.user.id+" tried to reject a walk for user "+user.id+" but it was removed or already accepted/rejected");
                updateState();
                updateStateRaw(socket.user);
            }
        } else {
            console.log(socket.user.id+' rejected a walk for an invalid user ('+data.pid+')');
        }
    };
    socket.user.aStart = function(data: Data){
        updateState();
        var user = findUser(data.pid);
        if(user != undefined){
            if(user.state == State.uAccepted){
                console.log(socket.user.id+" started a walk with user "+user.id);
                user.state = State.uWalking;
                updateState();
                updateStateRaw(socket.user);
                updateStateRaw(user);
            } else {
                console.log(socket.user.id+" tried to start a walk for user "+user.id+" but it was removed or already started/rejected");
            }
        } else {
            console.log(socket.user.id+' started a walk for an invalid user ('+data.pid+')');
        }
    };
    socket.user.aEnd = function(data: Data){
        updateState();
        var user = findUser(data.pid);
        if(user != undefined){
            if(user.state == State.uWalking){
                if(user.walker==socket.user && user == socket.user.toWalk[0]){
                    console.log(socket.user.id+" ended a walk for user "+user.id);
                    user.state = State.uNone;
                    updateState();
                    updateStateRaw(socket.user);
                    updateStateRaw(user);
                } else {
                    console.log(socket.user.id+" tried to end a walk for user "+user.id+" but was not this user's assigned walker");
                }
            } else {
                console.log(socket.user.id+" tried to end a walk for user "+user.id+" but it was removed or already started/rejected");
            }
        } else {
            console.log(socket.user.id+' ended a walk for an invalid user ('+data.pid+')');
        }
    };
}

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

function findUser(pid){
    for(var i = 0; i < maxUsers; i++){
        if(users[i] != undefined && users[i].pid == pid){
            return users[i];
        }
    }
    return undefined;
}

function isWalker(){
    for(var i = 0; i < maxUsers; i++){
        if(users[i] != undefined && users[i].admin){
            return true;
        }
    }
    return false;
}

function nextWalker(data: Location){ //needs work!
    for(var i = 0; i < maxUsers; i++){
        if(users[i] != undefined && users[i].admin){
            return users[i];
        }
    }
}

function getDis(){
    //https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&mode=walking&origins=35.9079876,-79.0480345&destinations=35.9081102,%20-79.0502256&key=AIzaSyAdF87T_v7G-XPdwRdCBjlHzyVm1mGRZA8
}

var port = 8080;
http.listen(port, function(){
    console.log('SafeWalk server started on port '+port);
});