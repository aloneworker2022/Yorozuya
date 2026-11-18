const L=require('./lib.cjs'),draw=require('./mold6.cjs');L.png({width:256,height:256,pixels:draw(1,1,1)},1,process.argv[2]||'front_one.png');
