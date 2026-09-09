import fs from 'node:fs';
import path from 'node:path';
export function discoverCodex({configured,env=process.env,exists=fs.existsSync}={}){
  if(configured&&path.isAbsolute(configured)&&exists(configured))return configured;
  // A removed App version is expected after upgrades. Discover the current
  // App-managed installation, then explicit PATH candidates; never rewrite PATH.
  const root=path.join(env.LOCALAPPDATA||'', 'OpenAI','Codex','bin');
  let candidates=[];
  try{candidates=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>path.join(root,x.name,'codex.exe')).filter(exists).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);}catch{}
  if(candidates.length)return candidates[0];
  for(const dir of (env.PATH||'').split(path.delimiter))for(const file of process.platform==='win32'?['codex.exe']:['codex']){const candidate=path.join(dir,file);if(exists(candidate))return candidate;}
  throw Object.assign(Error('Codex executable unavailable: configure an absolute codexPath or install Codex App. No credentials or CODEX_CLI_PATH were changed.'),{code:'CODEX_NOT_FOUND'});
}
