let reviewPID, walkPID: string;
let polling = false;
let sessionID = "";
function send(data:{}){
    function getResponse(){
        let data = {};
        try{
            data = JSON.parse(this.responseText);
        } catch(e){}
        message(data);
    }
    var req = new XMLHttpRequest();
    req.addEventListener("load", getResponse);
    console.log(`http://safewalkserver-ahharvey.cloudapps.unc.edu/data?${Object.keys(data).reduce((a,i)=>(a+`${i}=${data[i]}&`),"")}a=1`);
    req.open("GET", `http://safewalkserver-ahharvey.cloudapps.unc.edu/data?${Object.keys(data).reduce((a,i)=>(a+`${i}=${data[i]}&`),"")}a=1`);
    req.send();
}
function poll(){
    send({id:sessionID,event:"getState"});
    if(polling){
        setTimeout(poll,5000);
    }
}
function setup(){
    message({'event':'goodLogin'});
}
function message(data){
    console.log(data);
    let text = undefined;
    if(data.event == 'badLogin'){
        text = data.message;
    } else if(data.event == 'login'){
        sessionID = data.id;
        polling = true;
        poll();
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
    send({'event':'login','fullname':a,'pid':b,'phone':c});
}
function uRequest(a, b){
    send({id:sessionID,'event':'uRequest','walkStart':a,'walkEnd':b});
}
function uCancel(){
    send({id:sessionID,'event':'uCancel'});
}
function aAccept(){
    send({id:sessionID,'event':'aAccept','pid':reviewPID});
}
function aReject(a){
    send({id:sessionID,'event':'aReject','pid':reviewPID,'message':a});
}
function aStart(a){
    send({id:sessionID,'event':'aStart','pid':walkPID});
}
function aEnd(a){
    send({id:sessionID,'event':'aEnd','pid':walkPID});
}
$(setup);