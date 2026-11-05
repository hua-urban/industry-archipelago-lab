import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';

const ISLANDS = [
  { id:'a', title:'地主改建', x:-18, z:-12, r:9.1, color:0xc5b185, roof:0xb9a385, seed:11 },
  { id:'b', title:'老屋現金流', x:16, z:-13, r:7.8, color:0xd7bd8d, roof:0xb96749, seed:23 },
  { id:'c', title:'傳承安居', x:-23, z:12, r:8.8, color:0xb9c7a0, roof:0x879e87, seed:37 },
  { id:'d', title:'商用空間', x:23, z:11, r:8.0, color:0xa4bba6, roof:0x4a8585, seed:49 },
  { id:'e', title:'房產與事業', x:0, z:1, r:7.9, color:0x9bb58b, roof:0x65886d, seed:61 }
];
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
export function createArchipelago({container,onSelect=()=>{},onError=()=>{},reducedMotion=false}) {
  let inViewport=true;
  let disposed=false, raf=0, active=new Set(ISLANDS.map(v=>v.id)), tour=!reducedMotion;
  let width=1,height=1, mobileLayout=null, frames=0, elapsed=0,last=performance.now(), sampleStart=last, fps=0;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xbdd6d4);
  const camera=new THREE.PerspectiveCamera(40,1,0.2,350);
  camera.position.set(43,34,46);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.className='scene-canvas';
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;';
  container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,0,0); controls.enableDamping=true; controls.dampingFactor=.065;
  controls.minDistance=47;controls.maxDistance=145;controls.maxPolarAngle=1.24;controls.minPolarAngle=.35;
  controls.autoRotate=tour;controls.autoRotateSpeed=.21;
  controls.enablePan=true;controls.screenSpacePanning=false;controls.maxTargetRadius=15;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight(0xedf8ed,0x6b8581,2.6));
  const sun=new THREE.DirectionalLight(0xffefcf,3.3);sun.position.set(-28,65,25);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;
  sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.normalBias=.08;
  const geos=new Set(), mats=new Set();
  const geo=g=>(geos.add(g),g);
  const material=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88,...opts});mats.add(m);return m;};
  const box=geo(new THREE.BoxGeometry(1,1,1)), cylinder=geo(new THREE.CylinderGeometry(1,1,1,12));
  const cone=geo(new THREE.ConeGeometry(1,1,6)), sphere=geo(new THREE.IcosahedronGeometry(1,1));
  const mesh=(g,m,parent,pos=[0,0,0],scale=[1,1,1])=>{const o=new THREE.Mesh(g,m);o.position.set(...pos);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const seaMat=material(0x6caaa9,{roughness:.37,metalness:.18});
  const sea=mesh(geo(new THREE.PlaneGeometry(1200,1200)),seaMat,scene);sea.rotation.x=-Math.PI/2;sea.position.y=-.42;sea.castShadow=false;
  // Fine, static water contours keep the sea legible without a costly shader.
  const waterLines=new THREE.Group();scene.add(waterLines);
  const lineMat=new THREE.LineBasicMaterial({color:0xd1e7db,transparent:true,opacity:.18});mats.add(lineMat);
  const waveRandom=rng(123), waterSegments=[];for(let i=0;i<80;i++){
    const x=(waveRandom()-.5)*155,z=(waveRandom()-.5)*125,len=1+waveRandom()*4;
    const pts=[];for(let j=0;j<6;j++)pts.push(new THREE.Vector3(x+j*len/5,-.385,z+Math.sin(j/5*Math.PI)*.13));
    for(let j=1;j<pts.length;j++)waterSegments.push(pts[j-1],pts[j]);
  }
  waterLines.add(new THREE.LineSegments(geo(new THREE.BufferGeometry().setFromPoints(waterSegments)),lineMat));
  const islandData=new Map(), pickables=[], labels=[], ripples=[];
  const m4=new THREE.Matrix4(), quat=new THREE.Quaternion(), p=new THREE.Vector3(), s=new THREE.Vector3();
  function instances(g,m,transforms,parent){if(!transforms.length)return;const inst=new THREE.InstancedMesh(g,m,transforms.length);transforms.forEach((t,i)=>{p.set(...t.p);s.set(...t.s);quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,t.rot||0);m4.compose(p,quat,s);inst.setMatrixAt(i,m4);});inst.castShadow=true;inst.receiveShadow=true;parent.add(inst);return inst;}
  function outline(cfg){
    const profiles={
      a:[[-11,-2],[-9,2],[-5,4],[1,5],[7,3],[11,0],[8,-3],[3,-4],[-3,-4]],
      b:[[-8,-2],[-7,3],[-4,5],[-1,3],[2,5],[6,3],[8,0],[6,-4],[3,-5],[1,-3],[-2,-5],[-6,-4]],
      c:[[-8,0],[-7,4],[-3,6],[2,6],[7,4],[8,0],[6,-4],[4,-5],[3,-2],[1,0],[-2,0],[-4,-2],[-4,-5],[-7,-4]],
      d:[[-8,-4],[-8,2],[-5,5],[1,5],[7,3],[8,-1],[5,-1],[5,-5],[2,-5],[2,-2],[-1,-2],[-1,-5],[-4,-5],[-4,-3]],
      e:[[-9,-1],[-7,4],[-3,6],[1,5],[5,6],[8,3],[9,-1],[6,-4],[2,-5],[-1,-4],[-5,-5],[-8,-3]]
    };
    const pts=profiles[cfg.id].map(([x,y])=>new THREE.Vector3(x,y,0));
    if(cfg.id==='d')return new THREE.Shape(pts.map(v=>new THREE.Vector2(v.x,v.y)));
    const curve=new THREE.CatmullRomCurve3(pts,true,'centripetal');
    return new THREE.Shape(curve.getPoints(128).map(v=>new THREE.Vector2(v.x,v.y)));
  }
  for(const cfg of ISLANDS){
    const root=new THREE.Group();root.position.set(cfg.x,0,cfg.z);scene.add(root);
    const own=[];const mat=(color,opts)=>{const m=material(color,opts);own.push({m,color:m.color.clone()});return m;};
    const sand=mat(0xe3d4ac),rock=mat(0x879a83),land=mat(cfg.color),road=mat(0xe5ddc5),walls=mat(0xece7d2),roof=mat(cfg.roof),glass=mat(0x8fb5b1,{roughness:.28,metalness:.1}),wood=mat(0x967b58),leaf=mat(cfg.id==='c'?0x718c6a:0x547955),leafLight=mat(0x88a16b);
    const shape=outline(cfg);
    const terrainGeo=geo(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:true,bevelSize:.5,bevelThickness:.3,bevelSegments:2,steps:1,curveSegments:16}));
    function terrain(m,y,xz,h){const o=mesh(terrainGeo,m,root,[0,y,0],[xz,xz,h]);o.rotation.x=-Math.PI/2;o.userData.islandId=cfg.id;pickables.push(o);return o;}
    terrain(rock,-.12,1.035,.8);terrain(sand,.37,1.015,.2);terrain(land,.62,.92,.21);
    const coastPts=shape.getPoints(96).map(v=>new THREE.Vector3(v.x*1.08,-.29,-v.y*1.08));
    const foamMat=new THREE.LineBasicMaterial({color:0xe8f0d6,transparent:true,opacity:.53});mats.add(foamMat);own.push({m:foamMat,color:foamMat.color.clone()});
    const foam=new THREE.LineLoop(geo(new THREE.BufferGeometry().setFromPoints(coastPts)),foamMat);root.add(foam);ripples.push(foam);
    const buildings=[],roofs=[],windows=[],trunks=[],crowns=[],crowns2=[];
    const random=rng(cfg.seed+100);
    const makeBuilding=(x,z,w,d,h,rotation=0)=>{
      buildings.push({p:[x,1+h/2,z],s:[w,h,d],rot:rotation});
      roofs.push({p:[x,1+h+.16,z],s:[w+.16,.28,d+.16],rot:rotation});
      for(let yy=1.5;yy<h+.8;yy+=.85) windows.push({p:[x,yy,z+d/2+.016],s:[w*.67,.29,.025],rot:rotation});
    };
    function tree(x,z,t=1){trunks.push({p:[x,1.6,z],s:[.13,1.4,.13]});crowns.push({p:[x,2.45*t,z],s:[.75*t,1.05*t,.75*t]});crowns2.push({p:[x+.25,2.2*t,z-.18],s:[.6*t,.7*t,.6*t]});}
    // A compact civic grid, with a sculpted skyline and a central promenade.
    if(cfg.id==='a'){
      mesh(box,road,root,[0,1.02,0],[12,.08,1.1]);mesh(box,road,root,[0,1.03,0],[1.05,.08,9.5]);
      for(const x of [-4.4,-2.1,2.1,4.4])for(const z of [-2.7,2.5])makeBuilding(x,z,1.55,1.8,2+random()*4.3);
      for(const x of [-5.7,-3,2.7,5.6]){tree(x,-.6,.85);tree(x,.65,.8);}
      mesh(cylinder,road,root,[0,1.06,0],[1.4,.18,1.4]);
      mesh(cylinder,glass,root,[0,1.2,0],[.95,.12,.95]);
    }
    // B: varied terracotta roofs and intimate lanes around a village square.
    if(cfg.id==='b'){
      mesh(box,road,root,[0,1.03,0],[10,.08,1]);
      for(const x of [-4.5,-2.2,.2,2.6,4.7])for(const z of [-2.3,2.1]){
        const h=1.15+random()*.8;makeBuilding(x,z,1.55,1.55,h);
        const r=mesh(cone,roof,root,[x,1+h+.65,z],[1.32,1.05,1.32]);r.rotation.y=Math.PI/4;
      }
      for(const t of [[-5,0],[5,0],[-1,-4],[2,4],[-3,4]])tree(...t,.9);
      mesh(cylinder,road,root,[0,1.08,0],[1.2,.16,1.2]);
    }
    // C: low residential pavilions around a sheltered crescent garden.
    if(cfg.id==='c'){
      for(const [x,z,r] of [[-3,-2,-.3],[0,-3,0],[3,-2,.3]])makeBuilding(x,z,2.5,1.8,1.65,r);
      const pool=mesh(cylinder,glass,root,[0,1.04,-1.3],[1.4,.1,.65]);pool.castShadow=false;
      for(const t of [[-6,-1],[-6,2],[-5,4],[5,3],[6,0],[4,-4],[-3,-4]])tree(...t,.85+random()*.3);
      mesh(box,road,root,[0,1.03,-.3],[10,.1,.7]);
      for(const x of [-2.8,2.8])mesh(box,wood,root,[x,1.35,1.2],[1.2,.22,.45]);
    }
    // D: commercial waterfront, an angular landmark and piers.
    if(cfg.id==='d'){
      makeBuilding(-2.8,-1.6,2.3,2.5,3.3);makeBuilding(.3,-2,2.2,2.4,5.8);makeBuilding(3,-1.6,1.9,2,2.6);
      for(const x of [-3,0,3]){mesh(box,wood,root,[x,.8,6.3],[.75,.22,4.5]);mesh(box,road,root,[x,1.04,2.7],[2.2,.08,1]);}
      mesh(box,road,root,[0,1.02,1],[10,.12,1.15]);
      for(const x of [-5,5]){tree(x,-1,.9);tree(x,1.4,.8);}
    }
    // E: green campus, landscaped terraces, an open central court.
    if(cfg.id==='e'){
      makeBuilding(-3,-1,2.5,3,2.2);makeBuilding(2.6,-1.5,2.7,2.3,3.1);makeBuilding(1,2.4,2.8,1.6,1.5);
      mesh(cylinder,road,root,[0,1.04,0],[2,.12,2]);
      mesh(cylinder,leafLight,root,[0,1.17,0],[1.05,.17,1.05]);tree(0,0,.9);
      for(const t of [[-5,-2],[-4,3],[-2,4],[4,2],[4,-4],[0,-4]])tree(...t,.8+random()*.3);
      mesh(box,road,root,[0,1.04,0],[.8,.08,10]);
    }
    instances(box,walls,buildings,root);instances(box,roof,roofs,root);instances(box,glass,windows,root);
    instances(cylinder,wood,trunks,root);instances(sphere,leaf,crowns,root);instances(sphere,leafLight,crowns2,root);
    root.traverse(o=>{if(o.isMesh){o.userData.islandId=cfg.id;if(!pickables.includes(o))pickables.push(o);}});
    const button=document.createElement('button');button.type='button';button.className='island-marker';button.dataset.island=cfg.id;
    button.innerHTML=`<span class="island-marker-letter">${cfg.id.toUpperCase()}</span><span>${cfg.title}</span>`;
    button.setAttribute('aria-label',`${cfg.id.toUpperCase()} 島，${cfg.title}`);
    button.style.cssText='position:absolute;left:0;top:0;z-index:3;white-space:nowrap;pointer-events:auto;';
    button.addEventListener('click',()=>onSelect(cfg.id));container.appendChild(button);
    labels.push({button,point:new THREE.Vector3(cfg.x,0,cfg.z+3),x:0,y:0});
    islandData.set(cfg.id,{root,own,cfg});
  }
  // Route curves skim the water, with small luminous waypoints.
  const routes=new THREE.Group();scene.add(routes);let routeResources=[], currentEdges=[];
  function setActive(groupIds=ISLANDS.map(v=>v.id),edges=[]){
    active=new Set(groupIds);currentEdges=edges;
    for(const [id,{own}] of islandData){const selected=active.has(id);for(const {m,color} of own){m.color.copy(color);if(!selected)m.color.lerp(new THREE.Color(0x9ab6ae),.57);if(m.emissive)m.emissive.setHex(selected?0x000000:0x07110e);} }
    for(const {button} of labels){const selected=active.has(button.dataset.island);button.classList.toggle('is-active',selected);button.style.opacity=selected?'1':'.58';button.setAttribute('aria-pressed',String(selected));}
    routes.clear();for(const r of routeResources)r.dispose();routeResources=[];
    for(const edge of edges){const a=islandData.get(edge.from)?.root.position,b=islandData.get(edge.to)?.root.position;if(!a||!b)continue;
      const start=new THREE.Vector3(a.x,.7,a.z),end=new THREE.Vector3(b.x,.7,b.z),mid=start.clone().lerp(end,.5);mid.y=3.3;
      const curve=new THREE.QuadraticBezierCurve3(start,mid,end);
      const g=new THREE.TubeGeometry(curve,36,.095,5,false),m=new THREE.MeshBasicMaterial({color:0xffe9a5,transparent:true,opacity:.94});routeResources.push(g,m);routes.add(new THREE.Mesh(g,m));
    }
  }
  const boat=new THREE.Group(),boatMat=material(0xf2e9ce),boatWood=material(0x8b6347);
  mesh(box,boatWood,boat,[0,0,0],[.7,.22,1.75]);mesh(box,boatMat,boat,[0,.36,.12],[.53,.5,.9]);
  mesh(box,boatMat,boat,[0,.67,.1],[.68,.12,1.05]);scene.add(boat);
  const wakeMat=new THREE.LineBasicMaterial({color:0xe2f0df,transparent:true,opacity:.48});mats.add(wakeMat);
  const wake=new THREE.LineSegments(geo(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.3,-.1,-1),new THREE.Vector3(-.8,-.1,-3.4),new THREE.Vector3(.3,-.1,-1),new THREE.Vector3(.8,-.1,-3.4)])),wakeMat);boat.add(wake);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  const pointerDown=e=>{down={x:e.clientX,y:e.clientY};};
  const pointerUp=e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit)onSelect(hit.object.userData.islandId);};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
  function resize(){if(disposed)return;const rect=container.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);camera.aspect=width/height;camera.fov=width<600?55:40;camera.updateProjectionMatrix();renderer.setSize(width,height,false);const mobile=width<600;if(mobile!==mobileLayout){
      if(mobile)camera.position.set(0,56,71);else camera.position.set(43,34,46);
      const compact={a:[-10,-15],b:[10,-15],c:[-10,15],d:[10,15],e:[0,0]};
      for(const [id,item] of islandData){const [x,z]=mobile?compact[id]:[item.cfg.x,item.cfg.z];item.root.position.set(x,0,z);const label=labels.find(v=>v.button.dataset.island===id);label.point.set(x,0,z+(mobile?6:3));}
      mobileLayout=mobile;setActive([...active],currentEdges);
    }}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const visibilityObserver=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;});visibilityObserver.observe(container);
  const projected=new THREE.Vector3();
  function animate(time){if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden||!inViewport){last=time;return;}const dt=Math.min((time-last)/1000,.06);last=time;elapsed+=dt;frames++;if(time-sampleStart>1000){fps=Math.round(frames*1000/(time-sampleStart));frames=0;sampleStart=time;}
    controls.update(dt);
    if(!reducedMotion){const t=elapsed*.035;boat.position.set(Math.sin(t)*39,-.05,Math.cos(t)*26);boat.rotation.y=Math.atan2(Math.cos(t)*39,-Math.sin(t)*26);wake.material.opacity=.35+Math.sin(elapsed*1.7)*.1;}
    else {boat.position.set(8,-.05,21);boat.rotation.y=.8;}
    const placed=[];
    const projectedLabels=labels.map(label=>{projected.copy(label.point).project(camera);const bw=label.button.offsetWidth||120,bh=label.button.offsetHeight||42;return {label,bw,bh,x:Math.max(8,Math.min(width-bw-8,(projected.x*.5+.5)*width-bw/2)),y:Math.max(8,Math.min(height-bh-8,(-projected.y*.5+.5)*height+(width<600?14:22)))};}).sort((a,b)=>a.y-b.y);
    for(const entry of projectedLabels){let {label,bw,bh,x,y}=entry;
      for(let pass=0;pass<(width<600?0:5);pass++){const clash=placed.find(r=>x<r.x+r.w+8&&x+bw+8>r.x&&y<r.y+r.h+5&&y+bh+5>r.y);if(!clash)break;
        if(clash.y+clash.h+bh+13<height)y=clash.y+clash.h+6;
        else {const right=clash.x+clash.w+8;x=right+bw+8<width?right:Math.max(8,clash.x-bw-8);}
      }
      x=Math.round(x);y=Math.round(Math.min(height-bh-8,y));placed.push({x,y,w:bw,h:bh});if(x!==label.x||y!==label.y){label.button.style.transform=`translate3d(${x}px,${y}px,0)`;label.x=x;label.y=y;}}

    renderer.render(scene,camera);
  }
  setActive();raf=requestAnimationFrame(animate);
  const contextLost=e=>{e.preventDefault();onError(new Error('3D 場景暫時無法顯示，請重新整理頁面。'));};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return {
    setActive,setTour(value){tour=Boolean(value)&&!reducedMotion;controls.autoRotate=tour;},resize,
    getMetrics(){return {fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:renderer.getPixelRatio(),islands:5,tour,active:[...active]};},
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();visibilityObserver.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',contextLost);for(const {button} of labels)button.remove();for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const r of routeResources)r.dispose();renderer.dispose();renderer.domElement.remove();}
  };
}
