const zlib=require('zlib'),fs=require('fs');
const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (~c)>>>0};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
module.exports=function png(f,s,file){const w=f.width*s,h=f.height*s,raw=Buffer.alloc((w*4+1)*h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const si=((y/s|0)*f.width+(x/s|0))*4,di=y*(w*4+1)+1+x*4;for(let k=0;k<4;k++)raw[di+k]=f.pixels[si+k];}
const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
