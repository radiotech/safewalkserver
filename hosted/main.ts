let socket: WebSocket;
let reviewPID, walkPID: string;
function setup(){
    socket = new WebSocket('ws://localhost:3001');
    socket.onopen = function(){setTimeout(function(){message({'event':'goodLogin'});}, 500);}
    socket.onclose = function(){message({'event':'badConnect'});}
    socket.onmessage = function(msg: MessageEvent){message(JSON.parse(msg.data));}
}
function message(data){
    console.log(data);
    let text = undefined;
    if(data.event == 'badLogin'){
        text = data.message;
    } else if(data.event == 'uNone'){
        text = data.walkers>0?'There are no walkers online yet. They should be online [SAFEWALK HOURS].':('The next walk is available '+(data.time=='0'?'now!':(data.time=='1'?'in 1 minute.':'in '+data.time+' minutes.')));
    } else if(data.event == 'uPending'){
        text = 'Your walk is being approved, it should start in '+((data.time=='1'||data.time=='0')?'a minute.':data.time+' minutes.');
    } else if(data.event == 'uRejected'){
        text = 'Your walk was rejected because '+data.message;
    } else if(data.event == 'uAccepted'){
        text = 'Your walk was approved! It should start in '+((data.time=='1'||data.time=='0')?'a minute':data.time+' minutes')+'. '+data.fullname+' will accompany you on your walk tonight. They can be contacted at '+data.phone+'.';
    } else if(data.event == 'uWalking'){
        text = 'Your walk was started! It should only take another '+((data.time=='1'||data.time=='0')?'minute':data.time+' minutes')+' to complete.';
    } else if(data.event == 'aReview'){
        reviewPID = data.pid;
        $('.myG').val('your walk was not reasonable.');
        text = 'A user named "'+data.fullname+'" with pid "'+data.pid+'" and phone number "'+data.phone+'" just requested a walk from X to Y.';
    } else if(data.event == 'aBiking'){
        walkPID = data.pid;
        text = data.fullname+' is expecting you at X in '+((data.time=='1'||data.time=='0')?'a few seconds':data.time+' minutes')+'. If you are running late, you can let them know at '+data.phone+'.';
    } else if(data.event == 'aWalking'){
        walkPID = data.pid;
        text = 'Your walk was started! It should only take another '+((data.time=='1'||data.time=='0')?'minute':data.time+' minutes')+' to complete.';
    } //aNone, goodLogin, badConnect - have no custom text
    $('.myShow').removeClass('myShow').addClass('myHide');
    if(text!=undefined){$('.'+data.event+'Text').html(text);}
    $('.'+data.event).removeClass('myHide').removeClass('myHide2').addClass('myShow');
}
function login(a: string, b: string, c: string){
    $('.myA').val(a);$('.myB').val(b);$('.myC').val(c);$('.myD').val(a);$('.myE').val(b);$('.myF').val(c);
    socket.send(JSON.stringify({'event':'login','fullname':a,'pid':b,'phone':c}));
}
function uRequest(a, b){
    socket.send(JSON.stringify({'event':'uRequest','walkStart':a,'walkEnd':b}));
}
function uCancel(){
    socket.send(JSON.stringify({'event':'uCancel'}));
}
function aAccept(){
    socket.send(JSON.stringify({'event':'aAccept','pid':reviewPID}));
}
function aReject(a){
    socket.send(JSON.stringify({'event':'aReject','pid':reviewPID,'message':a}));
}
function aStart(a){
    socket.send(JSON.stringify({'event':'aStart','pid':walkPID}));
}
function aEnd(a){
    socket.send(JSON.stringify({'event':'aEnd','pid':walkPID}));
}
$(setup);