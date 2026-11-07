const D=require(__dirname+'/../room_doll_full.js');
const mk=()=>{const d=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});d.shape='round';d.areola='medium';d.hair='none';d.face='anime';return d};
const pose=process.argv[2];const NF=D.POSES?.[pose]?.frames||2;let tot=0,diff=0;
for(const yaw of [0,45,90,180,-90])for(let f=0;f<Math.min(NF,2);f++){const a=D.render(mk(),pose,f,yaw,{scale:2}).pixels,b=D.renderParts(mk(),pose,f,yaw,{scale:2}).composite.pixels;
 for(let i=0;i<a.length;i+=4){if(a[i+3]||b[i+3]){tot++;if(a[i]!=b[i]||a[i+1]!=b[i+1]||a[i+2]!=b[i+2]||a[i+3]!=b[i+3])diff++}}}
console.log(pose.padEnd(11),'px',String(tot).padStart(7),'diff',String(diff).padStart(4),(diff/tot*100).toFixed(3)+'%');
