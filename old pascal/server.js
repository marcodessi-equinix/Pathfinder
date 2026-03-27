const express = require("express");
const fs = require("fs");
const multer = require("multer");
const app = express();

const upload = multer({ dest: "public/images/" });

app.use(express.json());
app.use(express.static("public"));

const DB = "db.json";

// ---------- DB HELPERS ----------
function readDB(){
  if(!fs.existsSync(DB)){
    const init = {rooms:{}, feedback:[], analytics:[]};
    fs.writeFileSync(DB, JSON.stringify(init,null,2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB));
}

function writeDB(data){
  fs.writeFileSync(DB, JSON.stringify(data,null,2));
}

// ---------- ROOMS ----------
app.get("/api/rooms",(req,res)=>{
  res.json(readDB().rooms);
});

app.post("/api/rooms",(req,res)=>{
  const db = readDB();
  db.rooms[req.body.usid] = req.body;
  writeDB(db);
  res.json({ok:true});
});

app.delete("/api/rooms/:id",(req,res)=>{
  const db = readDB();
  delete db.rooms[req.params.id];
  writeDB(db);
  res.json({ok:true});
});

// ---------- FEEDBACK ----------
app.post("/api/feedback",(req,res)=>{
  const db = readDB();
  db.feedback.push({...req.body, timestamp:new Date().toISOString()});
  writeDB(db);
  res.json({ok:true});
});

app.get("/api/feedback",(req,res)=>{
  res.json(readDB().feedback);
});

// ---------- ANALYTICS ----------
app.post("/api/search",(req,res)=>{
  const db = readDB();
  db.analytics.push({usid:req.body.usid, ts:new Date().toISOString()});
  writeDB(db);
  res.json({ok:true});
});

// ---------- REPORT ----------
app.get("/api/report",(req,res)=>{
  const db = readDB();
  let map={};

  db.analytics.forEach(a=>{
    map[a.usid]=map[a.usid]||{s:0,u:0,d:0};
    map[a.usid].s++;
  });

  db.feedback.forEach(f=>{
    map[f.usid]=map[f.usid]||{s:0,u:0,d:0};
    if(f.rating==="up") map[f.usid].u++;
    if(f.rating==="down") map[f.usid].d++;
  });

  let csv="USID,Searches,Up,Down\n";
  Object.entries(map).forEach(([u,v])=>{
    csv+=`${u},${v.s},${v.u},${v.d}\n`;
  });

  res.setHeader("Content-Type","text/csv");
  res.send(csv);
});

// ---------- FEEDBACK CSV ----------
app.get("/api/feedback/export",(req,res)=>{
  const fb = readDB().feedback;
  let csv="USID,Rating,Comment,Timestamp\n";
  fb.forEach(f=>{
    csv+=`${f.usid},${f.rating},"${f.comment}",${f.timestamp}\n`;
  });
  res.setHeader("Content-Type","text/csv");
  res.send(csv);
});

// ---------- IMPORT ----------
app.post("/api/import",(req,res)=>{
  const db = readDB();
  db.rooms = req.body;
  writeDB(db);
  res.json({ok:true});
});

// ---------- IMAGES ----------
app.post("/api/upload-image",upload.single("image"),(req,res)=>{
  res.json({ok:true});
});

app.get("/api/images",(req,res)=>{
  res.json(fs.readdirSync("public/images"));
});

app.listen(3000,()=>console.log("http://localhost:3000"));