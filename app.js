const socket = io();
let localStream;
let peerConnection;
let currentRoom;
let gameActive = false;
let nsfwModel = null;
let aiInterval = null;

const truthQuestions = [
  "What's the most embarrassing thing you've ever done?","What's your biggest fear?","Have you ever lied to your best friend?",
  "What's the last thing you Googled?","What's your guilty pleasure?","Have you ever pretended to like someone?",
  "What's the weirdest food you've eaten?","What's a secret talent you have?","Have you ever cheated on anything?",
  "What's the most childish thing you still do?","What's the worst date you've been on?","What's your biggest insecurity?",
  "Have you ever stolen something?","What's the longest you've gone without showering?","What's your most awkward moment?"
];
const dareQuestions = [
  "Do 10 jumping jacks right now!","Speak in a funny accent for 30 seconds!","Show the last photo in your phone gallery!",
  "Sing part of your favorite song loudly!","Do your best celebrity impression!","Dance for 15 seconds!",
  "Say a tongue twister 3 times fast!","Make the funniest face you can!","Tell a joke right now!",
  "Do a fake commercial for something near you!","Speak only in questions for 1 minute!","Do your best animal sound!",
  "Balance on one foot for 20 seconds!","Say the alphabet backwards!","Do your best robot dance!"
];

function getRandomQuestion(){const type=Math.random()<0.5?'TRUTH':'DARE';const q=type==='TRUTH'?truthQuestions:dareQuestions;return{type,question:q[Math.floor(Math.random()*q.length)]};}
function sendNewQuestion(){const{type,question}=getRandomQuestion();socket.emit('send-game',{roomId:currentRoom,question:type+': '+question});addMessage(type+': '+question,'game');}

// AI MODEL
async function loadAI(){try{nsfwModel=await nsfwjs.load();console.log('AI Ready');}catch(e){console.log('AI loading...');}}
loadAI();

function startAI(){if(!nsfwModel||!localStream)return;aiInterval=setInterval(async()=>{try{const video=document.getElementById('local-video');if(!video||video.readyState<2)return;const predictions=await nsfwModel.classify(video);const bad=predictions.find(p=>(p.className==='Porn'||p.className==='Hentai'||p.className==='Sexy')&&p.probability>0.7);if(bad){socket.emit('ai-report',{type:bad.className,confidence:Math.round(bad.probability*100)});}}catch(e){}},3000);}
function stopAI(){if(aiInterval){clearInterval(aiInterval);aiInterval=null;}}

socket.on('banned',()=>{document.querySelector('.app').style.display='none';document.getElementById('ban-overlay').classList.add('show');});
socket.on('online-count',(c)=>{document.getElementById('online-count').textContent=c||0;});
socket.on('ai-warning',(d)=>{showToast('⚠️ AI Warning #'+d.count+' ('+d.total+'/3). Keep it clean!');});

function startChat(){
  const btn=document.getElementById('start-btn');btn.disabled=true;document.getElementById('status').textContent='Connecting...';
  navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(stream=>{
    localStream=stream;document.getElementById('local-video').srcObject=stream;
    document.getElementById('landing-page').classList.remove('active');document.getElementById('chat-page').classList.add('active');
    socket.emit('find-partner');startAI();
  }).catch(()=>{alert('Camera required!');btn.disabled=false;document.getElementById('status').textContent='';});
}
window.startChat=startChat;

socket.on('matched',async(data)=>{
  currentRoom=data.roomId;gameActive=false;document.getElementById('partner-label').textContent='Connected';
  peerConnection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  localStream.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));
  peerConnection.ontrack=(e)=>{document.getElementById('remote-video').srcObject=e.streams[0];};
  peerConnection.onicecandidate=(e)=>{if(e.candidate)socket.emit('ice-candidate',{roomId:currentRoom,candidate:e.candidate});};
  const offer=await peerConnection.createOffer();await peerConnection.setLocalDescription(offer);socket.emit('offer',{roomId:currentRoom,offer});
});
socket.on('offer',async(d)=>{
  peerConnection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  localStream.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));
  peerConnection.ontrack=(e)=>{document.getElementById('remote-video').srcObject=e.streams[0];};
  peerConnection.onicecandidate=(e)=>{if(e.candidate)socket.emit('ice-candidate',{roomId:currentRoom,candidate:e.candidate});};
  await peerConnection.setRemoteDescription(new RTCSessionDescription(d.offer));
  const answer=await peerConnection.createAnswer();await peerConnection.setLocalDescription(answer);socket.emit('answer',{roomId:currentRoom,answer});
});
socket.on('answer',async(d)=>{await peerConnection.setRemoteDescription(new RTCSessionDescription(d.answer));});
socket.on('ice-candidate',async(d)=>{if(d.candidate)await peerConnection.addIceCandidate(new RTCIceCandidate(d.candidate));});

function sendMsg(){const i=document.getElementById('msg-input');const m=i.value.trim();if(m&&currentRoom){socket.emit('send-message',{roomId:currentRoom,message:m});addMessage(m,'me');i.value='';}}
window.sendMsg=sendMsg;
socket.on('receive-message',(d)=>{addMessage(d.message,'you');});
function addMessage(t,ty){const div=document.getElementById('msg-list');const m=document.createElement('div');m.className='bubble '+ty;m.textContent=t;div.appendChild(m);div.scrollTop=div.scrollHeight;}

function sendReaction(e){if(currentRoom){socket.emit('send-reaction',{roomId:currentRoom,reaction:e});showFloatingEmoji(e);}}
window.sendReaction=sendReaction;
socket.on('receive-reaction',(d)=>{showFloatingEmoji(d.reaction);});
function showFloatingEmoji(e){const el=document.createElement('div');el.textContent=e;el.style.cssText='position:fixed;top:50%;left:50%;font-size:55px;pointer-events:none;z-index:999;animation:ra 1s forwards;';document.body.appendChild(el);setTimeout(()=>el.remove(),1000);}
const as=document.createElement('style');as.textContent='@keyframes ra{0%{transform:translate(-50%,-50%)scale(0);opacity:1}50%{transform:translate(-50%,-50%)scale(1.4);opacity:1}100%{transform:translate(-50%,-50%)translateY(-60px);opacity:0}}';document.head.appendChild(as);

function requestGame(){if(!currentRoom){showToast('Wait for a partner!');return;}socket.emit('game-request',{roomId:currentRoom});addMessage('You requested Truth or Dare...','game');}
window.requestGame=requestGame;
socket.on('game-request',()=>{document.getElementById('game-popup-overlay').style.display='flex';});
function acceptGame(){document.getElementById('game-popup-overlay').style.display='none';socket.emit('game-accepted',{roomId:currentRoom});gameActive=true;addMessage('Game started!','game');sendNewQuestion();}
window.acceptGame=acceptGame;
function declineGame(){document.getElementById('game-popup-overlay').style.display='none';socket.emit('game-declined',{roomId:currentRoom});addMessage('You declined.','you');}
window.declineGame=declineGame;
socket.on('game-accepted',()=>{gameActive=true;showToast('Game started!');});
socket.on('game-declined',()=>{addMessage('Partner declined.','game');});
socket.on('receive-game',(d)=>{addMessage(d.question,'game');});

function reportUser(){if(!currentRoom){showToast('No partner!');return;}const r=prompt('Reason:\n1.Inappropriate\n2.Harassment\n3.Spam\n4.Other');if(r){socket.emit('report-user',{roomId:currentRoom,reason:r});showToast('Reported!');}}
window.reportUser=reportUser;
socket.on('report-filed',(d)=>{showToast('Report #'+d.count+'/3 filed.');});
socket.on('report-done',()=>{showToast('User banned!');setTimeout(nextPerson,1500);});

function nextPerson(){gameActive=false;if(peerConnection){peerConnection.close();peerConnection=null;}document.getElementById('msg-list').innerHTML='<p style="color:#555;text-align:center;padding:30px;">Say hello! 👋</p>';document.getElementById('partner-label').textContent='Connecting...';document.getElementById('remote-video').srcObject=null;socket.emit('skip');setTimeout(()=>socket.emit('find-partner'),300);stopAI();setTimeout(()=>startAI(),1000);}
window.nextPerson=nextPerson;
socket.on('partner-disconnected',()=>{gameActive=false;showToast('Partner left. Finding new...');setTimeout(nextPerson,1200);});

function showToast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}
document.getElementById('msg-input')?.addEventListener('keypress',(e)=>{if(e.key==='Enter')sendMsg();});