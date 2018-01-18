const express = require('express');
const app = express();
const http = require('http').Server(app);
app.use(express.static('hosted'))

const maxUsers = 1000;
let nextUser = 0;
let idMap = {};
let users: User[] = [];

for(let i = 0; i < maxUsers; i++){
    users[i] = undefined;
}

enum State {uNone, uPending, uRejected, uAccepted, uWalking}
const STATE = ["IDLE", "PENDING", "REJECTED", "ACCEPTED", "WALKING"];

interface Data {
    event: string;
    time?: string;
    message?: string;
    fullname?: string;
    pid?: string;
    phone?: string;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
}

class User {
    active: boolean;
    fullname: string;
    pid: string;
    phone: string;
    username: string;
    admin: boolean;
    
    state: State; /*user data*/
    walker: User;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    message: string;

    toWalk: User[]; /*admin data*/

    constructor(fullname: string, pid: string, phone: string, admin: boolean){
        this.active = true;
        this.fullname = fullname;
        this.pid = pid;
        this.phone = phone;
        this.username = (admin?'admin ':'user ')+pid+" ("+fullname+")";
        this.admin = admin;

        this.state = State.uNone;
        this.walker = undefined;
        this.startX = -1;
        this.startY = -1;
        this.endX = -1;
        this.endY = -1;
        this.message = 'an error occurred.';

        this.toWalk = [];

        users[nextUser++] = this;
        nextUser = nextUser%maxUsers;
    }

    static login(fullname: string, pid: string, phone: string){
        if(fullname == ""){
            console.log(`Someone attempted to log in with an invalid name.`);
            return {event:"badLogin", message:"Plese enter a valid name."};
        }
        if(!isUser(pid)){
            console.log(`Someone attempted to log in with an invalid pid.`);
            return {event:"badLogin", message:"Plese enter a valid pid."};
        }
        if(phone == ""){
            console.log(`Someone attempted to log in with an invalid phone number.`);
            return {event:"badLogin", message:"Plese enter a valid phone number."};
        }
        var user = getUser(pid);
        if(user != undefined){
            user.fullname = fullname;
            user.phone = phone;
            user.username = (user.admin?'admin ':'user ')+pid+" ("+fullname+")";
        } else {
            user = isAdmin(pid)?new Walker(fullname,pid,phone):new Walkee(fullname,pid,phone);
        }

        let sessionID = genSessionID();
        idMap[sessionID] = user;
        
        console.log(`${user.username} connected from IP ...:... with phone number ${user.phone}`);
        return {event:"goodLogin", id:sessionID};
    }
}

class Walker extends User {

    constructor(fullname: string, pid: string, phone: string){
        super(fullname, pid, phone, true);
    }

    ping(){
        let toAccept: User = undefined;
        for(let i = 0; i < this.toWalk.length; i++){
            if(this.toWalk[i].state == State.uPending){
                toAccept = this.toWalk[i];
                break;
            }
        }
        if(toAccept != undefined){
            return {'event':'aReview','fullname':toAccept.fullname,'pid':toAccept.pid,'phone':toAccept.phone,'startX':toAccept.startX,'startY':toAccept.startY,'endX':toAccept.endX,'endY':toAccept.endY};
        } else if(this.toWalk.length == 0){
            return {'event':'aNone'};
        } else if(this.toWalk[0].state == State.uAccepted) {
            console.log('x3');
            return {'event':'aBiking','fullname':this.toWalk[0].fullname,'pid':this.toWalk[0].pid,'phone':this.toWalk[0].phone,'startX':this.toWalk[0].startX,'startY':this.toWalk[0].startY,'time':'9'};
        } else {
            console.log('x4');
            return {'event':'aWalking','fullname':this.toWalk[0].fullname,'pid':this.toWalk[0].pid,'phone':this.toWalk[0].phone,'endX':this.toWalk[0].endX,'endY':this.toWalk[0].endY,'time':'9'};
        }
    }
    aAccept(data: Data){
        var user = getUser(data.pid);
        if(user != undefined){
            if(user.state == State.uPending){
                console.log(this.username+" accepted a walk for "+user.username);
                user.state = State.uAccepted;
                user.walker = this;
            } else {
                console.log(this.username+" tried to accepted a walk for "+user.username+" but they were "+STATE[user.state]);
            }
        } else {
            console.log(this.username+' accepted a walk for an invalid user ('+data.pid+')');
        }
        return this.ping();
    }
    aReject(data: Data){
        var user = getUser(data.pid);
        if(user != undefined){
            if(user.state == State.uPending){
                console.log(this.username+" REJECTED a walk for "+user.username+' because "'+data.message+'"');
                user.state = State.uRejected;
                user.message = `"${data.message}"`;
            } else {
                console.log(this.username+" tried to reject a walk for "+user.username+" but they were "+STATE[user.state]);
            }
        } else {
            console.log(this.username+' rejected a walk for an invalid user ('+data.pid+')');
        }
        return this.ping();
    }
    aStart(data: Data){
        var user = getUser(data.pid);
        if(user != undefined){
            if(user.state == State.uAccepted){
                console.log(this.username+" started a walk with "+user.username);
                user.state = State.uWalking;
            } else {
                console.log(this.username+" tried to start a walk for "+user.username+" but they were "+STATE[user.state]);
            }
        } else {
            console.log(this.username+' started a walk for an invalid user ('+data.pid+')');
        }
        return this.ping();
    }
    aEnd(data: Data){
        var user = getUser(data.pid);
        if(user != undefined){
            if(user.state == State.uWalking){
                if(user.walker==this && user == this.toWalk[0]){
                    console.log(this.username+" ended a walk for "+user.username);
                    user.state = State.uNone;
                } else {
                    console.log(this.username+" tried to end a walk for "+user.username+" but was not this user's assigned walker");
                }
            } else {
                console.log(this.username+" tried to end a walk for "+user.username+" but they were "+STATE[user.state]);
            }
        } else {
            console.log(this.username+' ended a walk for an invalid user ('+data.pid+')');
        }
        return this.ping();
    }
}

class Walkee extends User {
    
    constructor(fullname: string, pid: string, phone: string){
        super(fullname,pid,phone,false);
    }

    ping(){
        switch(this.state){
            case State.uNone:
                return {'event':'uNone','time':'9'};
            case State.uPending:
                return {'event':'uPending','time':'9'};
            case State.uRejected:
                return {'event':'uRejected','message':this.message};
            case State.uAccepted:
                console.log('x1');
                return {'event':'uAccepted','fullname':this.walker.fullname,'phone':this.walker.phone,'time':'9'};
            case State.uWalking:
                console.log('x2');
                return {'event':'uWalking','fullname':this.walker.fullname,'phone':this.walker.phone,'time':'9'};
        }
    }
    uRequest(data: Data){
        if(data.startX != undefined && data.startY != undefined && data.endX != undefined && data.endY != undefined){
            if(this.state == State.uNone){
                if(isWalker()){
                    console.log(`${this.username} requested a walk [(${data.startX}, ${data.startY}) to (${data.endX}, ${data.endY})]`);
                    this.state = State.uPending;
                    this.startX = data.startX;
                    this.startY = data.startY;
                    this.endX = data.endX;
                    this.endY = data.endY;
                    this.walker = nextWalker(this.startX,this.startY);
                } else {
                    console.log(this.username+" tried to request a walk but there are no available walkers");
                    this.state = State.uRejected;
                    this.message = 'there are no walkers online.';
                }
            } else {
                console.log(this.username+" tried to request a walk from an invalid state");
            }
        } else {
            console.log(this.username+' requested a walk with invalid data ('+JSON.stringify(data)+')');
        }
        return this.ping();
    }

    uCancel(data: Data){
        if(this.state == State.uPending || this.state == State.uAccepted || this.state == State.uRejected){
            console.log(this.username+" canceled their walk while "+STATE[this.state]);
            var tempWalker = this.walker;
            this.state = State.uNone;
        } else {
            console.log(this.username+" tried to cancel their walk but it does not exist");
        }
        return this.ping();
    }
}

function isAdmin(pid: string){
    return pid=='1' || pid=='2';
}
function isUser(pid: string){
    if(/^[0-9]{9}$/.test(pid) || /^[0-9]{1}$/.test(pid) || /^[0-9]{2}$/.test(pid)){ //! testing allow 1 or 2 number pid
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

function getUser(pid){
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

function nextWalker(x: number, y: number){ //needs work!
    for(var i = 0; i < maxUsers; i++){
        if(users[i] != undefined && users[i].admin){
            return users[i];
        }
    }
}

function getDis(){
    //https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&mode=walking&origins=35.9079876,-79.0480345&destinations=35.9081102,%20-79.0502256&key=AIzaSyAdF87T_v7G-XPdwRdCBjlHzyVm1mGRZA8
}

function genSessionID(id = ""){
    let chars = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    id = id+chars.charAt(Math.floor(Math.random()*chars.length));
    return id.length<16?genSessionID(id):id;
}


app.use('/data', function (req, res, next) {
    let data = req.query;
    if(data.event != undefined){
        if(data.id != undefined){
            let user = idMap[data.id];
            if(user != undefined){
                try{
                    res.send(JSON.stringify(user[data.event](data)));
                    return;
                } catch(e) {
                    console.log(`could not process message data: "${JSON.stringify(data)}" because "${e.name}": "${e.message}"`);
                }
            } else {
                console.log(`Recieved a user request with invalid session id: "${data.id}"`);
            }
        } else if(data.event=="login"){
            res.send(JSON.stringify(User.login(data.fullname || "", data.pid || "", data.phone || "")));
            return;
        } else {
            console.log(`Recieved a message with an event but no session id: "${JSON.stringify(data)}"`);
        }
    } else {
        console.log(`Recieved a message without an event: "${JSON.stringify(data)}"`);
    }
    res.send(JSON.stringify({event:"badConnect"}));
})

var port = 8080;
http.listen(port, function(){
    console.log('SafeWalk server started on port '+port);
});