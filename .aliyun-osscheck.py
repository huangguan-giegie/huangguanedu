import subprocess, sys
r = subprocess.run(['node','-e','''
const OSS=require("ali-oss");const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync("/opt/huangguanedu/.env.production","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["\x27]|["\x27]$/g,"")]));
const b=new OSS({region:env.OSS_REGION,accessKeyId:env.OSS_ACCESS_KEY_ID,accessKeySecret:env.OSS_ACCESS_KEY_SECRET,bucket:env.OSS_BUCKET,endpoint:env.OSS_ENDPOINT,authorizationV4:true});
const prefix=env.OSS_BACKUP_PREFIX||"backups/postgres";
b.list({prefix,"max-keys":1000}).then(r=>{
  const dumps=r.object.filter(o=>o.name.endsWith(".dump"));
  console.log("对象总数:"+r.object.length+"  dump数:"+dumps.length);
  dumps.slice(-5).forEach(o=>console.log("  "+o.name+"  "+o.size+"B  "+o.last_modified));
}).catch(e=>console.log("ERR "+e.message));
'''],capture_output=True,text=True,cwd='/opt/huangguanedu/releases/merge-20261013T203500Z-20261013T113127Z')
print(r.stdout.strip() or r.stderr.strip()[:300])
