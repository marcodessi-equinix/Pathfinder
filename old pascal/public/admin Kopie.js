async function loadRooms(){
  const res = await fetch("/api/rooms");
  const data = await res.json();
  rooms = Object.entries(data).map(([usid,info])=>({usid,...info}));
  renderRoomsGrid();
}

async function loadFeedback(){
  const res = await fetch("/api/feedback");
  const fb = await res.json();
  const tbody=document.querySelector("#feedbackTable tbody");
  tbody.innerHTML="";
  fb.forEach(f=>{
    tbody.innerHTML+=`<tr><td>${f.usid}</td><td>${f.rating}</td><td>${f.comment}</td><td>${f.timestamp}</td></tr>`;
  });
}