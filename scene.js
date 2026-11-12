import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import { sampleVesselMotion } from './vessel-motion.js?v=native8';
import { routes as topicRoutes, groups as contentGroups } from './content.js?v=public10';

const ISLANDS = [
  { id:'a', title:'地主改建', x:-23, z:-15, r:9.1, color:0xc5b185, roof:0x536c80, seed:11 },
  { id:'b', title:'老屋現金流', x:21, z:-16, r:7.8, color:0xd7bd8d, roof:0xb96749, seed:23 },
  { id:'c', title:'傳承安居', x:-24, z:17, r:8.8, color:0xb9c7a0, roof:0xc6b3d6, seed:37 },
  { id:'d', title:'商用空間', x:24, z:17, r:8.0, color:0xa4bba6, roof:0xb86c4e, seed:49 },
  { id:'e', title:'房產成長', x:0, z:1, r:7.9, color:0x9bb58b, roof:0xc37f61, seed:61 }
];
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
export function createArchipelago({container,onSelect=()=>{},onError=()=>{},reducedMotion=false}) {
  let inViewport=true;
  let disposed=false, raf=0, active=new Set(ISLANDS.map(v=>v.id)), tour=!reducedMotion;
  let hoveredGroup=null,revealedGroup=null;
  let width=1,height=1, mobileLayout=null, frames=0, elapsed=0,last=performance.now(), sampleStart=last, fps=0;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xbdd6d4);
  const camera=new THREE.PerspectiveCamera(40,1,0.2,350);
  camera.position.set(0,48,65);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,container.clientWidth<600?1.25:1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.03;
  renderer.shadowMap.enabled=false;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.className='scene-canvas';
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;';
  container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,0,0); controls.enableDamping=true; controls.dampingFactor=.065;
  controls.minDistance=47;controls.maxDistance=145;controls.maxPolarAngle=1.24;controls.minPolarAngle=.35;
  controls.autoRotate=tour;controls.autoRotateSpeed=.21;
  controls.enablePan=false;controls.screenSpacePanning=false;controls.maxTargetRadius=15;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  if(container.clientWidth<600){controls.enableRotate=false;controls.enableZoom=false;renderer.domElement.style.touchAction='pan-y';}
  scene.add(new THREE.HemisphereLight(0xe9f2df,0x526e69,1.8));
  const sun=new THREE.DirectionalLight(0xffedcf,2.8);sun.position.set(-28,65,25);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;
  sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.normalBias=.08;
  const geos=new Set(), mats=new Set();
  const geo=g=>(geos.add(g),g);
  const material=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88,...opts});mats.add(m);return m;};
  const box=geo(new THREE.BoxGeometry(1,1,1)), cylinder=geo(new THREE.CylinderGeometry(1,1,1,12));
  const cone=geo(new THREE.ConeGeometry(1,1,6)), sphere=geo(new THREE.IcosahedronGeometry(1,1));
  const mesh=(g,m,parent,pos=[0,0,0],scale=[1,1,1])=>{const o=new THREE.Mesh(g,m);o.position.set(...pos);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const seaMat=material(0x388f99,{roughness:.42,metalness:.12});
  seaMat.onBeforeCompile=shader=>{shader.uniforms.coastTime={value:0};seaMat.userData.shader=shader;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nwaterPosition=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 waterPosition; uniform float coastTime;').replace('#include <color_fragment>','#include <color_fragment>\nfloat wave=sin(waterPosition.x*.29+sin(waterPosition.y*.21)+coastTime)*sin(waterPosition.y*.33-coastTime*.6); diffuseColor.rgb *= .94 + wave*.075;');};
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
  const islandData=new Map(), pickables=[], labels=[], ripples=[], fans=[];
  const isMobile=container.clientWidth<600;
  const m4=new THREE.Matrix4(), quat=new THREE.Quaternion(), p=new THREE.Vector3(), s=new THREE.Vector3();
  function instances(g,m,transforms,parent,castShadow=true){if(!transforms.length)return;const inst=new THREE.InstancedMesh(g,m,transforms.length);transforms.forEach((t,i)=>{p.set(...t.p);s.set(...t.s);quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,t.rot||0);m4.compose(p,quat,s);inst.setMatrixAt(i,m4);});inst.castShadow=castShadow;inst.receiveShadow=true;parent.add(inst);return inst;}
  function outline(cfg,envelope=false){
    const profiles={
      a:[[-11,-2],[-9,2],[-5,4],[1,5],[7,3],[11,0],[8,-3],[3,-4],[-3,-4]],
      b:[[-8,-2],[-7,3],[-4,5],[-1,3],[2,5],[6,3],[8,0],[6,-4],[3,-5],[1,-3],[-2,-5],[-6,-4]],
      c:[[-8,0],[-7,4],[-3,6],[2,6],[7,4],[8,0],[6,-4],[4,-5],[3,-2],[1,0],[-2,0],[-4,-2],[-4,-5],[-7,-4]],
      d:[[-8,-4],[-8,2],[-5,5],[1,5],[7,3],[8,-1],[5,-1],[5,-5],[2,-5],[2,-2],[-1,-2],[-1,-5],[-4,-5],[-4,-3]],
      e:[[-9,-1],[-7,4],[-3,6],[1,5],[5,6],[8,3],[9,-1],[6,-4],[2,-5],[-1,-4],[-5,-5],[-8,-3]]
    };
    const main={
      a:[[-11,-1.8],[-9,2],[-5,4],[1,5],[7,3],[11,0],[8,-2.4],[3,-2.2],[-3,-2.1],[-8,-1.8]],
      b:[[-8,-2.3],[-7,3],[-3,5],[2,4],[6,3],[8,0],[6,-2.8],[2,-3],[-3,-2.8],[-6,-2.5]],
      d:[[-8,-2.8],[-8,2],[-5,5],[1,5],[7,3],[8,0],[6,-2.8],[2,-3],[-3,-2.9],[-6,-2.6]],
      e:[[-9,-2.2],[-7,4],[-3,6],[2,5],[7,3],[9,0],[7,-2.8],[2,-2.9],[-3,-2.8],[-7,-2.3]]
    };
    const pts=(envelope?profiles[cfg.id]:main[cfg.id]||profiles[cfg.id]).map(([x,y])=>new THREE.Vector3(x,y,0));
    const curve=new THREE.CatmullRomCurve3(pts,true,'centripetal');
    return new THREE.Shape(curve.getPoints(128).map(v=>new THREE.Vector2(v.x,v.y)));
  }
  for(const cfg of ISLANDS){
    const root=new THREE.Group();root.position.set(cfg.x,0,cfg.z);scene.add(root);
    const own=[];const mat=(color,opts)=>{const m=material(color,opts);own.push({m,color:m.color.clone()});return m;};
    const sand=mat(0xe3d4ac),rock=mat(0x879a83),land=mat(cfg.color),road=mat(0xe5ddc5),walls=mat(cfg.id==='c'?0xb09ac3:0xece7d2),roof=mat(cfg.roof),glass=mat(0x8fb5b1,{roughness:.28,metalness:.1}),wood=mat(0x967b58),leaf=mat(cfg.id==='c'?0x718c6a:0x547955),leafLight=mat(0x88a16b);
    const shape=outline(cfg);
    const nav=outline(cfg,true).getPoints(112);if(nav[0].distanceTo(nav.at(-1))<.001)nav.pop();
    const navigationPoints=nav.map((v,i)=>{const sc=1.08+Math.sin(i*.63+cfg.seed)*.018+Math.sin(i*.19)*.022;return {x:v.x*sc,z:-v.y*sc};});
    // One continuous terrain skin: flat settlement, grassy shoulder, tapered beach, submerged rock.
    const contour=shape.getPoints(112);if(contour[0].distanceTo(contour.at(-1))<.001)contour.pop();
    const n=contour.length, terrainPositions=[],terrainColors=[],terrainIndices=[];
    const shoreRandom=rng(cfg.seed), shoreNoise=contour.map((v,i)=>Math.sin(i*.63+cfg.seed)*.018+Math.sin(i*.19)*.022);
    const groundColors=[new THREE.Color(cfg.id==='a'?0xa2a477:cfg.id==='b'?0xa5a36d:cfg.id==='c'?0x8caf73:cfg.id==='d'?0x88a99c:0x7fa566),new THREE.Color(0x82a366),new THREE.Color(0xd6c28e),new THREE.Color(0xa59d7d),new THREE.Color(0x657e73)];
    const ringScales=[.82,.94,1.015,1.055,1.08], ringHeights=[.99,.87,.17,-.12,-.48];
    for(let ring=0;ring<5;ring++)for(let i=0;i<n;i++){
      const v=contour[i], noise=shoreNoise[i], scale=ringScales[ring]+(ring?noise:0);
      terrainPositions.push(v.x*scale,ringHeights[ring]+(ring===1?Math.sin(i*.35+cfg.seed)*.10:0),-v.y*scale);
      const c=groundColors[ring].clone().multiplyScalar(.94+Math.sin(i*.47+cfg.seed)*.06);terrainColors.push(c.r,c.g,c.b);
    }
    for(let ring=0;ring<4;ring++)for(let i=0;i<n;i++){const j=(i+1)%n,a=ring*n+i,b=ring*n+j,c=(ring+1)*n+i,d=(ring+1)*n+j;terrainIndices.push(a,c,b,b,c,d);}
    for(const tri of THREE.ShapeUtils.triangulateShape(contour,[]))terrainIndices.push(tri[2],tri[1],tri[0]);
    const terrainGeo=geo(new THREE.BufferGeometry());terrainGeo.setAttribute('position',new THREE.Float32BufferAttribute(terrainPositions,3));terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(terrainColors,3));terrainGeo.setIndex(terrainIndices);terrainGeo.computeVertexNormals();
    const landContours=[contour.map((v,i)=>[v.x*(1.015+shoreNoise[i]),-v.y*(1.015+shoreNoise[i])])];
    const ground=mesh(terrainGeo,mat(0xffffff,{vertexColors:true,side:THREE.DoubleSide}),root);ground.userData.islandId=cfg.id;pickables.push(ground);
    const shoalPositions=[],shoalIndices=[];
    for(const scale of [1.045,1.17,1.31])for(let i=0;i<n;i++){const v=contour[i];shoalPositions.push(v.x*(scale+shoreNoise[i]),-.365,-v.y*(scale+shoreNoise[i]));}
    for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){const j=(i+1)%n,a=ring*n+i,b=ring*n+j,c=(ring+1)*n+i,d=(ring+1)*n+j;shoalIndices.push(a,b,c,b,d,c);}
    const shoalGeo=geo(new THREE.BufferGeometry());shoalGeo.setAttribute('position',new THREE.Float32BufferAttribute(shoalPositions,3));shoalGeo.setIndex(shoalIndices);shoalGeo.computeVertexNormals();
    const shoal=mesh(shoalGeo,mat(0x75c4b4,{transparent:true,opacity:.46,depthWrite:false,side:THREE.DoubleSide}),root);shoal.castShadow=false;
    const foamPoints=[];for(let i=0;i<n;i++){if(i%9>5)continue;for(const k of [i,(i+1)%n]){const v=contour[k],scale=1.09+shoreNoise[k];foamPoints.push(new THREE.Vector3(v.x*scale,-.30,-v.y*scale));}}
    const foamMat=new THREE.LineBasicMaterial({color:0xe7efd3,transparent:true,opacity:.48});mats.add(foamMat);own.push({m:foamMat,color:foamMat.color.clone()});
    const foam=new THREE.LineSegments(geo(new THREE.BufferGeometry().setFromPoints(foamPoints)),foamMat);root.add(foam);ripples.push(foam);
    const buildings=[],roofs=[],windows=[],trunks=[],crowns=[],crowns2=[],pines=[],stones=[],shrubs=[],flowers=[], hillocks=[], details=[], panels=[];
    const dark=mat(0x344f56), flowerMat=mat(cfg.id==='b'?0xe9aa81:0xe9cf77), stoneMat=mat(0x778377);
    const random=rng(cfg.seed+100);
    const makeBuilding=(x,z,w,d,h,rotation=0)=>{
      buildings.push({p:[x,1+h/2,z],s:[w,h,d],rot:rotation});
      roofs.push({p:[x,1+h+.16,z],s:[w+.16,.28,d+.16],rot:rotation});
      for(let yy=1.5;yy<h+.8;yy+=.85) windows.push({p:[x,yy,z+d/2+.016],s:[w*.67,.29,.025],rot:rotation});
    };
    function tree(x,z,t=1){trunks.push({p:[x,.99+.65*t,z],s:[.12*t,1.3*t,.12*t]});if(random()<.27){pines.push({p:[x,.99+1.55*t,z],s:[.68*t,2.1*t,.68*t]});}else{crowns.push({p:[x,.99+1.5*t,z],s:[.76*t,1.04*t,.68*t],rot:random()*6});crowns2.push({p:[x+.25*t,.99+1.3*t,z-.18*t],s:[.6*t,.74*t,.6*t]});}}
    function path(points,w=.35,m=road,y=1.025){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],o=mesh(box,m,root,[(a[0]+b[0])/2,y,(a[1]+b[1])/2],[w,.045,Math.hypot(dx,dz)+w]);o.rotation.y=Math.atan2(dx,dz);}}
    function bench(x,z,r=0){details.push({p:[x,1.3,z],s:[.95,.16,.38],rot:r});for(const dx of [-.32,.32])details.push({p:[x+dx,1.12,z],s:[.1,.26,.3],rot:r});}
    function pergola(x,z){for(const dx of [-.85,.85])for(const dz of [-.6,.6])details.push({p:[x+dx,1.75,z+dz],s:[.1,1.5,.1]});for(let i=0;i<6;i++)details.push({p:[x-.95+i*.38,2.54,z],s:[.12,.12,1.65]});}

    function islet(x,z,rx,rz){
      mesh(cylinder,sand,root,[x,.48,z],[rx*1.10,.85,rz*1.10]);mesh(cylinder,land,root,[x,.94,z],[rx,.14,rz]);
      landContours.push(Array.from({length:24},(_,i)=>[x+Math.cos(i/24*Math.PI*2)*rx*1.10,z+Math.sin(i/24*Math.PI*2)*rz*1.10]));
    }
    const hipRoof=geo(new THREE.ConeGeometry(1,1,4));
    function home(x,z,w,d,h){makeBuilding(x,z,w,d,h);const r=mesh(hipRoof,roof,root,[x,1+h+.32,z],[w*.75,.68,d*.75]);r.rotation.y=Math.PI/4;}
    function pavilion(x,z){for(const dx of [-.65,.65])for(const dz of [-.45,.45])mesh(cylinder,wood,root,[x+dx,1.65,z+dz],[.08,1.3,.08]);const r=mesh(hipRoof,leaf,root,[x,2.45,z],[1.3,.65,1.0]);r.rotation.y=Math.PI/4;}
    function cargo(x,z){for(let i=0;i<3;i++)mesh(box,i===1?roof:dark,root,[x-.65+i*.65,1.35,z],[.55,.65,.9]);mesh(box,wood,root,[x,1.02,z+1.1],[1.8,.15,.8]);const crane=mat(0xd7ad58);mesh(box,crane,root,[x+.8,2.05,z-.3],[.1,2.1,.1]);mesh(box,crane,root,[x+.25,3.08,z-.3],[1.7,.12,.12]);mesh(box,dark,root,[x-.45,2.7,z-.3],[.03,.7,.03]);}
    function fanFactory(x,z){
      const steel=mat(0x42636a),clear=mat(0xb9e4e8,{transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,roughness:.2});
      mesh(box,road,root,[x,1.02,z],[4.3,.12,3.5]);
      for(const dx of [-1.95,1.95])for(const dz of [-1.5,1.5])mesh(box,steel,root,[x+dx,2.4,z+dz],[.12,2.8,.12]);
      mesh(box,clear,root,[x,3.83,z],[4.25,.08,3.4]);
      for(const dz of [-1.5,0,1.5])mesh(box,steel,root,[x,3.76,z+dz],[4.1,.10,.08]);
      for(const dx of [-1.95,1.95])mesh(box,steel,root,[x+dx,3.75,z],[.10,.12,3.2]);
      mesh(box,clear,root,[x-2,2.5,z],[.04,2.4,3.1]);
      mesh(cylinder,dark,root,[x,3.43,z],[.065,.55,.065]);
      const hub=new THREE.Group();hub.position.set(x,3.17,z);root.add(hub);const fanBlack=mat(0x101c20);mesh(cylinder,fanBlack,hub,[0,0,0],[.2,.16,.2]);
      for(let i=0;i<6;i++){const a=i*Math.PI/3,blade=mesh(box,fanBlack,hub,[Math.sin(a)*.7,0,Math.cos(a)*.7],[.28,.08,1.4]);blade.rotation.y=a;}fans.push(hub);
    }
    if(cfg.id==='a'){
      for(const [x,z,w,h] of [[-5,-.8,1.8,1.8],[-2.2,-2.7,2,2.5],[1,.8,2.2,1.65],[4,-1.8,1.8,2.1]])makeBuilding(x,z,w,1.65,h);
      for(const z of [-3.8,-3.1])mesh(box,road,root,[-1.5,1.05,z],[9,.10,.35]);
      islet(-6.7,3.0,1.7,.55);makeBuilding(-6.8,3.0,1.2,1,1.0);const crane=mat(0xd7ad58);mesh(box,crane,root,[-5.8,2.5,3.0],[.12,3,.12]);mesh(box,crane,root,[-6.6,4.0,3.0],[2.5,.12,.12]);mesh(box,dark,root,[-7.5,3.4,3.0],[.03,1.1,.03]);
      islet(4.9,3.35,1.55,.60);pavilion(4.9,3.35);path([[-6.7,1.7],[-6.7,2.6]],.30,wood);path([[4.9,2.0],[4.9,2.8]],.30,wood);
      for(const x of [-7.5,6.5])tree(x,-1.3,.65);
    }else if(cfg.id==='b'){
      for(const [x,z,h] of [[-5,-2.3,1.4],[-3.4,.7,1.8],[-1.8,-2.7,2.0],[0,1.1,1.35],[1.8,-2.6,1.6],[3.5,.8,1.85],[5.1,-1.2,1.25]])home(x,z,1.3,1.35,h);
      mesh(box,road,root,[0,1.04,-.25],[11,.08,.6]);
      islet(-4.6,4.15,1.5,.6);islet(4.3,4.1,1.5,.6);home(-4.6,4.15,1.2,1.1,.9);home(4.3,4.1,1.2,1.1,1.0);
      path([[-4.6,2.6],[-4.6,3.7]],.3,wood);path([[4.3,2.6],[4.3,3.6]],.3,wood);tree(-6,-.5,.6);tree(6,-.2,.6);
    }else if(cfg.id==='c'){
      for(const [x,z] of [[-6.0,1.8],[-1.8,-3.7],[1.4,-3.7],[5.5,-.9]])home(x,z,1.8,1.4,1.3);
      mesh(box,road,root,[0,1.03,-.8],[10,.10,.65]);
      const liftGlass=mat(0xb2ccd3,{transparent:true,opacity:.58,roughness:.2});mesh(box,liftGlass,root,[6.0,2.8,3.0],[1.2,3.6,1.1]);
      for(const y of [1.3,2.3,3.3,4.5])mesh(box,roof,root,[6.0,y,3.0],[1.3,.12,1.2]);
      pergola(-5.5,.7);for(let i=0;i<5;i++)mesh(sphere,roof,root,[-6.2+i*.35,2.6,.7],[.28,.15,.5]);
      for(const t of [[-6,-1],[-6,2],[-5,4],[5,3],[4,-4]])tree(...t,.7);
    }else if(cfg.id==='d'){
      fanFactory(-5.2,-1.5);makeBuilding(.4,.6,1.8,1.65,2.6);makeBuilding(3.2,-2,1.7,1.8,2.1);makeBuilding(5.6,-1,1.35,1.4,1.4);
      islet(-2.5,4.65,1.25,.55);cargo(-2.5,4.5);islet(3.5,4.65,1.25,.55);pavilion(3.5,4.5);
      path([[-2.5,2.6],[-2.5,4.2]],.3,wood);path([[3.5,2.6],[3.5,4.2]],.3,wood);
    }else{
      fanFactory(6.0,-1.3);makeBuilding(-.2,-2.4,1.6,1.5,2.4);home(-4.0,-2.6,1.5,1.4,1.3);home(-2,-1.3,1.2,1.2,1.1);
      for(let i=0;i<3;i++){mesh(box,wood,root,[-4.5+i*.9,1.05,1.0],[.75,.12,1.2]);for(let j=0;j<3;j++)mesh(box,leafLight,root,[-4.5+i*.9,1.2,.65+j*.35],[.55,.15,.12]);}
      islet(-4.4,4.1,1.4,.6);cargo(-4.4,4.0);islet(3.4,4.1,1.4,.6);pavilion(3.4,4.0);
      path([[-4.4,2.7],[-4.4,3.7]],.3,wood);path([[3.4,2.7],[3.4,3.7]],.3,wood);tree(-6,-1.7,.65);tree(0,-4,.65);
    }
    // Peripheral planted shoulders follow each coastline, away from the settlement core.
    for(let i=0;i<n;i+=isMobile?9:6){
      const v=contour[i],x=v.x*.88,z=-v.y*.88;
      if(cfg.id==='c'&&z>0&&Math.abs(x)<4.5)continue;
      if((cfg.id==='d'&&x<-2.3)||(cfg.id==='e'&&x>2.4))continue;
      if(buildings.some(b=>Math.abs(b.p[0]-x)<b.s[0]/2+.8&&Math.abs(b.p[2]-z)<b.s[2]/2+.8))continue;
      if(Math.abs(x)<.7||Math.abs(z)<.65)continue;
      tree(x,z,.65+random()*.42);
      for(let j=0;j<3;j++)shrubs.push({p:[x+(random()-.5)*1.2,1.02,z+(random()-.5)*.9],s:[.35+random()*.3,.24+random()*.25,.4]});
      hillocks.push({p:[x*.96,.80,z*.96],s:[1.1,.42,.8]});
    }
    for(let i=0;i<n;i+=isMobile?7:4){if(i%13<4)continue;const v=contour[i],sc=1.04+shoreNoise[i];stones.push({p:[v.x*sc,-.02+random()*.17,-v.y*sc],s:[.26+random()*.5,.22+random()*.42,.28+random()*.4],rot:random()*6});}
    instances(box,wood,details,root);instances(box,dark,panels,root);instances(sphere,stoneMat,stones,root,!isMobile);instances(sphere,leafLight,shrubs,root,!isMobile);instances(sphere,flowerMat,flowers,root,!isMobile);instances(sphere,leafLight,hillocks,root,false);instances(cone,leaf,pines,root);
    instances(box,walls,buildings,root);instances(box,roof,roofs,root);instances(box,glass,windows,root);
    instances(cylinder,wood,trunks,root);instances(sphere,leaf,crowns,root);instances(sphere,leafLight,crowns2,root,!isMobile);
    // Static props with a shared geometry/material render together. Root-local
    // matrices preserve every existing path, roof and terrace placement exactly.
    // Nested fan assemblies remain separate so their animation is unchanged.
    const propBatches=new Map();
    for(const child of [...root.children]){
      if(!child.isMesh||child.isInstancedMesh)continue;
      const key=`${child.geometry.uuid}:${child.material.uuid}:${child.castShadow}`;
      if(!propBatches.has(key))propBatches.set(key,[]);
      propBatches.get(key).push(child);
    }
    for(const props of propBatches.values()){
      if(props.length<2)continue;
      const first=props[0],batch=new THREE.InstancedMesh(first.geometry,first.material,props.length);
      batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
      props.forEach((prop,i)=>{prop.updateMatrix();batch.setMatrixAt(i,prop.matrix);root.remove(prop);});
      batch.computeBoundingSphere();root.add(batch);
    }
    root.traverse(o=>{if(o.isMesh){o.userData.islandId=cfg.id;if(!pickables.includes(o))pickables.push(o);}});
    const button=document.createElement('button');button.type='button';button.className='island-marker';button.dataset.island=cfg.id;
    const fullName=contentGroups.find(group=>group.id===cfg.id).name;
    const parts=fullName.includes(' × ')?[fullName.split(' × ')[0]+' ×',fullName.split(' × ')[1]]:[fullName.slice(0,4),fullName.slice(4)];
    button.innerHTML=`<span class="island-marker-letter">${cfg.id.toUpperCase()}</span><span class="island-marker-name"><span>${parts[0]}</span><span>${parts[1]}</span></span>`;
    button.setAttribute('aria-label',`${cfg.id.toUpperCase()} 組，${fullName}，查看主題`);
    button.style.cssText='position:absolute;left:0;top:0;z-index:3;white-space:nowrap;pointer-events:auto;';
    button.addEventListener('click',event=>chooseIsland(cfg.id,event.pointerType==='touch'));
    button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')setHovered(cfg.id);});button.addEventListener('pointerleave',()=>setHovered(null));
    button.addEventListener('focus',()=>setHovered(cfg.id));button.addEventListener('blur',()=>setHovered(null));container.appendChild(button);
    const leader=document.createElement('span');leader.className='island-label-leader';leader.setAttribute('aria-hidden','true');container.appendChild(leader);
    labels.push({button,leader,point:new THREE.Vector3(cfg.x,0,cfg.z+3),x:0,y:0});
    islandData.set(cfg.id,{root,own,cfg,navigationPoints,landContours});
  }
  function refreshLabels(){for(const {button} of labels){const id=button.dataset.island,expanded=active.has(id)||hoveredGroup===id||revealedGroup===id;button.classList.toggle('is-expanded',expanded);button.setAttribute('aria-expanded',String(expanded));}}
  function setHovered(id){hoveredGroup=id;refreshLabels();}
  function revealGroup(id){revealedGroup=id;refreshLabels();}
  function chooseIsland(id,touch=false){const secondTap=revealedGroup===id;if(touch)revealGroup(id);onSelect(id,!touch||secondTap);}
  // A connected backbone uses five existing topic links; demand selection adds its own route.
  const availablePairs=new Set(topicRoutes.map(route=>contentGroups.filter(g=>route[g.id]).map(g=>g.id).sort().join(':')));
  const backbonePairs=[['a','b'],['b','d'],['c','d'],['c','e'],['a','e'],['a','c']].filter(pair=>availablePairs.has(pair.join(':')));
  const routes=new THREE.Group(),network=new THREE.Group();scene.add(routes,network);
  let routeResources=[],networkResources=[],currentEdges=[],routeCurves=[],couriers=[],portRings=[],traffic=[];
  function routeCurve(from,to){
    const a=islandData.get(from),b=islandData.get(to);if(!a||!b)return null;
    const av=a.root.position,bv=b.root.position,delta=bv.clone().sub(av);delta.y=0;delta.normalize();
    const shore=(item,direction)=>Math.max(...item.navigationPoints.map(p=>(p.x*direction.x+p.z*direction.z)*item.root.scale.x))+1.6;
    const start=av.clone().addScaledVector(delta,shore(a,delta)),end=bv.clone().addScaledVector(delta,-shore(b,delta.clone().negate()));
    const key=[from,to].sort().join(':');
    // Side docks keep the short central links clear of land and the stable labels.
    const docks={
      'a:e':{a:[0,7],e:[-12,0]},
      'b:e':{b:[0,8],e:[12,0]},
      'c:e':{c:[12,0],e:[0,10]},
      'd:e':{d:[-12,0],e:[0,10]}
    }[key];
    if(docks){const da=docks[from],db=docks[to];start.copy(av).add(new THREE.Vector3(da[0]*a.root.scale.x,0,da[1]*a.root.scale.x));end.copy(bv).add(new THREE.Vector3(db[0]*b.root.scale.x,0,db[1]*b.root.scale.x));}
    start.y=end.y=.08;
    const mid=start.clone().lerp(end,.5);mid.y=.08;
    // Long diagonals pass around the central island rather than through its terrain.
    const bend=key==='a:d'?30:key==='b:c'?-30:key==='a:b'?-3:key==='c:d'?4:0;
    mid.x+=-delta.z*bend;mid.z+=delta.x*bend;
    const curve=new THREE.QuadraticBezierCurve3(start,mid,end);
    const coast=(item,point)=>{
      const direction=point.clone().sub(item.root.position);direction.y=0;direction.normalize();
      let hit=0;for(const contour of item.landContours)for(let i=0;i<contour.length;i++){const j=(i+1)%contour.length,ax=contour[i][0]*item.root.scale.x,az=contour[i][1]*item.root.scale.x,bx=contour[j][0]*item.root.scale.x,bz=contour[j][1]*item.root.scale.x,ex=bx-ax,ez=bz-az,den=direction.x*ez-direction.z*ex;if(Math.abs(den)<.00001)continue;const t=(ax*ez-az*ex)/den,u=(ax*direction.z-az*direction.x)/den;if(t>=0&&u>=0&&u<=1)hit=Math.max(hit,t);}
      const anchor=item.root.position.clone().addScaledVector(direction,Math.max(0,hit-.65));anchor.y=.28;return anchor;
    };
    curve.docks=[{shore:coast(a,start),port:start},{shore:coast(b,end),port:end}];return curve;
  }
  function rebuildNetwork(){
    for(const vessel of traffic){scene.remove(vessel.boat);disposeVessel(vessel.boat);}traffic=[];
    network.clear();for(const resource of networkResources)resource.dispose();networkResources=[];
    for(const [from,to] of backbonePairs){
      const curve=routeCurve(from,to);if(!curve)continue;
      const g=new THREE.TubeGeometry(curve,32,.17,6,false),m=new THREE.MeshBasicMaterial({color:0xd6f1dc,transparent:true,opacity:.92,depthWrite:false});
      networkResources.push(g,m);network.add(new THREE.Mesh(g,m));addDocks(curve,network,false);
    }
    for(const [index,pair] of [['a','c'],['b','d'],['a','e']].entries()){const boat=makeVessel(false);scene.add(boat);traffic.push({boat,curve:routeCurve(...pair),phase:index*.58});}
    renderer.domElement.dataset.network=JSON.stringify(backbonePairs);
    renderer.domElement.dataset.trafficBoats=String(traffic.length);
  }
  function setActive(groupIds=ISLANDS.map(v=>v.id),edges=[]){
    active=new Set(groupIds);currentEdges=edges;revealedGroup=null;
    for(const [id,{own}] of islandData){const selected=active.has(id);for(const {m,color} of own){m.color.copy(color);if(!selected)m.color.lerp(new THREE.Color(0x9ab6ae),.08);if(m.emissive)m.emissive.setHex(selected?0x000000:0x07110e);}}
    for(const {button} of labels){const selected=active.has(button.dataset.island);button.classList.toggle('is-active',selected);button.style.opacity=selected?'1':'.85';button.setAttribute('aria-pressed',String(selected));}
    refreshLabels();
    for(const boat of couriers)disposeVessel(boat);routes.clear();for(const resource of routeResources)resource.dispose();routeResources=[];routeCurves=[];couriers=[];portRings=[];
    const resourceMesh=(g,m)=>{routeResources.push(g,m);const o=new THREE.Mesh(g,m);routes.add(o);return o;};
    for(const edge of edges){
      const curve=routeCurve(edge.from,edge.to);if(!curve)continue;
      if(!backbonePairs.some(pair=>pair.join(':')===[edge.from,edge.to].sort().join(':')))addDocks(curve,routes,true);
      // A dark underlay separates the warm active channel from the pale network.
      resourceMesh(new THREE.TubeGeometry(curve,40,.38,6,false),new THREE.MeshBasicMaterial({color:0x28695e})).position.y=-.34;
      resourceMesh(new THREE.TubeGeometry(curve,40,.27,6,false),new THREE.MeshBasicMaterial({color:0xffdc75}));
      routeCurves.push(curve);
      const courier=makeVessel(true);routes.add(courier);couriers.push(courier);
      for(const t of [.3,.7]){
        const arrow=resourceMesh(new THREE.ConeGeometry(.48,1.2,3),new THREE.MeshBasicMaterial({color:0xfff1b5}));
        arrow.position.copy(curve.getPoint(t));arrow.position.y+=.22;
        const tangent=curve.getTangent(t).multiplyScalar(t<.5?1:-1);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent.normalize());
      }
      for(const t of [0,1])for(let ring=0;ring<2;ring++){
        const port=resourceMesh(new THREE.RingGeometry(.9+ring*.55,1.2+ring*.55,24),new THREE.MeshBasicMaterial({color:0xffde80,transparent:true,opacity:ring?.5:1,side:THREE.DoubleSide,depthWrite:false}));
        port.rotation.x=-Math.PI/2;port.position.copy(curve.getPoint(t));port.position.y=.14;port.userData.phase=ring*.5;portRings.push(port);
      }
    }
    renderer.domElement.dataset.activeRoutes=JSON.stringify(edges);
  }
  const dockTimber=material(0xddbb79),dockCap=material(0xffedbf);
  function addDocks(curve,parent,highlight){
    for(const {shore,port} of curve.docks){
      const delta=port.clone().sub(shore),length=Math.hypot(delta.x,delta.z);
      const pier=mesh(box,dockTimber,parent,[(shore.x+port.x)/2,.28,(shore.z+port.z)/2],[.85,.32,length+.2]);pier.rotation.y=Math.atan2(delta.x,delta.z);
      mesh(cylinder,dockCap,parent,[port.x,.29,port.z],[1.15,.32,1.15]);
    }
  }
  const hullShape=new THREE.Shape();hullShape.moveTo(-.44,-.9);hullShape.lineTo(.44,-.9);hullShape.lineTo(.48,.45);hullShape.lineTo(0,1.1);hullShape.lineTo(-.48,.45);hullShape.closePath();
  const hullGeometry=geo(new THREE.ExtrudeGeometry(hullShape,{depth:.22,bevelEnabled:false}));hullGeometry.rotateX(Math.PI/2);hullGeometry.translate(0,.22,0);
  const vesselWhite=material(0xfff9dc),vesselGold=material(0xf6c85c),vesselPale=material(0xd6e7d5),vesselGlass=material(0x387a7c);
  const vesselWakeGeometry=geo(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.26,0,-1),new THREE.Vector3(-.8,0,-3),new THREE.Vector3(.26,0,-1),new THREE.Vector3(.8,0,-3)]));
  const vesselWakeMaterial=new THREE.LineBasicMaterial({color:0xe8fff0,transparent:true,opacity:.72});mats.add(vesselWakeMaterial);
  function makeVessel(highlight){
    const boat=new THREE.Group();boat.scale.setScalar(highlight?2.04:1.48);
    mesh(hullGeometry,highlight?vesselGold:vesselPale,boat);
    mesh(box,vesselWhite,boat,[0,.43,-.18],[.6,.5,.82]);
    mesh(box,vesselGlass,boat,[0,.49,.245],[.42,.19,.025]);
    mesh(box,highlight?vesselGold:vesselWhite,boat,[0,.72,-.18],[.73,.11,1]);
    const wakeMaterial=vesselWakeMaterial.clone();mats.add(wakeMaterial);const wake=new THREE.LineSegments(vesselWakeGeometry,wakeMaterial);wake.position.y=-.05;boat.add(wake);boat.userData.wake=wake;return boat;
  }
  function disposeVessel(boat){const m=boat.userData.wake?.material;if(m){mats.delete(m);m.dispose();}}
  function sail(boat,curve,phase=0,highlight=false){
    const motion=reducedMotion?{state:'still',progress:highlight?.5:phase%1,headingOffset:0,speedFraction:0}:sampleVesselMotion(elapsed,phase,highlight);
    const trim=Math.min(.27,(boat.scale.x*1.1+1.0)/curve.getLength()),t=trim+motion.progress*(1-2*trim);
    boat.position.copy(curve.getPointAt(t));boat.position.y+=.02;
    const tangent=curve.getTangentAt(t);boat.rotation.y=Math.atan2(tangent.x,tangent.z)+motion.headingOffset;
    const wake=boat.userData.wake;wake.visible=motion.speedFraction>.025;wake.material.opacity=.72*motion.speedFraction;
    wake.scale.z=.3+.7*motion.speedFraction;wake.position.z=-(1-wake.scale.z);
    boat.userData.motion=motion;
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  const pointerDown=e=>{down={x:e.clientX,y:e.clientY};};
  const pointerUp=e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit)chooseIsland(hit.object.userData.islandId,e.pointerType==='touch');};
  const pointerMove=e=>{if(e.pointerType==='touch'||down)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);setHovered(raycaster.intersectObjects(pickables,false)[0]?.object.userData.islandId||null);};
  const pointerLeave=()=>setHovered(null);
  renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerleave',pointerLeave);
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
  function resize(){if(disposed)return;delete renderer.domElement.dataset.terrainBounds;const rect=container.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);camera.aspect=width/height;camera.fov=width<600?50:40;camera.updateProjectionMatrix();renderer.setSize(width,height,false);const mobile=width<600;if(mobile!==mobileLayout){
      if(mobile){camera.position.set(0,70,48);controls.target.set(0,0,-3);}else{camera.position.set(0,48,65);controls.target.set(0,0,0);}
      const compact={a:[-12.5,-19],b:[12.5,-19],c:[-12.5,17],d:[12.5,17],e:[0,-1]};
      for(const [id,item] of islandData){const [x,z]=mobile?compact[id]:[item.cfg.x,item.cfg.z];item.root.position.set(x,0,z);item.root.scale.setScalar(mobile?.83:1.2);const label=labels.find(v=>v.button.dataset.island===id);const anchor={a:[0,1.3,-3.3],b:[0,1.3,-3.2],c:[0,1.3,-3.3],d:[2.6,1.3,-1.5],e:[-2.8,1.3,-2.4]}[id];label.point.set(x+anchor[0]*item.root.scale.x,anchor[1]*item.root.scale.x,z+anchor[2]*item.root.scale.x);}
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.25:1.5));renderer.shadowMap.enabled=false;mobileLayout=mobile;controls.autoRotate=!mobile&&tour;controls.enableRotate=!mobile;controls.enableZoom=!mobile;renderer.domElement.style.touchAction=mobile?'pan-y':'none';controls.autoRotateSpeed=.17;rebuildNetwork();setActive([...active],currentEdges);
    }}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const visibilityObserver=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;});visibilityObserver.observe(container);
  const projected=new THREE.Vector3();
  function animate(time){if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden||!inViewport){last=time;return;}const dt=Math.min((time-last)/1000,.06);last=time;if(tour)elapsed+=dt;frames++;if(time-sampleStart>1000){fps=Math.round(frames*1000/(time-sampleStart));frames=0;sampleStart=time;renderer.domElement.dataset.renderMetrics=JSON.stringify({fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries});}
    if(!mobileLayout&&tour&&!down){const azimuth=controls.getAzimuthalAngle();if(azimuth>.20)controls.autoRotateSpeed=.17;else if(azimuth<-.20)controls.autoRotateSpeed=-.17;}
    controls.update(dt);
    if(!reducedMotion){if(seaMat.userData.shader)seaMat.userData.shader.uniforms.coastTime.value=elapsed*.12;for(const f of fans)f.rotation.y=elapsed*.8;for(const foam of ripples)foam.material.opacity=.42+Math.sin(elapsed*.9)*.08;}
    for(let i=0;i<couriers.length;i++)sail(couriers[i],routeCurves[i],0,true);
    for(const vessel of traffic)sail(vessel.boat,vessel.curve,vessel.phase);
    for(const ring of portRings){const pulse=reducedMotion?0:(elapsed*.6+ring.userData.phase)%1;ring.scale.setScalar(1+pulse*.55);ring.material.opacity=(1-pulse*.6)*(ring.userData.phase?.65:1);}
    // All states share the same reserved ground anchor and fixed label frame.
    for(const label of labels){
      projected.copy(label.point).project(camera);
      const groundX=(projected.x*.5+.5)*width,groundY=(-projected.y*.5+.5)*height;
      // Fixed mobile callout lanes leave the buildings and north/south shipping lanes clear.
      const offsets={a:[0,-33],b:[0,-33],c:[-48,-45],d:[33,-52],e:[12,-41]};
      const [dx,dy]=mobileLayout?offsets[label.button.dataset.island]:[0,0];
      const x=Math.round(Math.max(label.button.offsetWidth/2+6,Math.min(width-label.button.offsetWidth/2-6,groundX+dx*width/350.5))),y=Math.round(groundY+dy*width/350.5);
      if(x!==label.x||y!==label.y){label.button.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;label.x=x;label.y=y;}
      label.leader.hidden=!mobileLayout;
      if(mobileLayout){const expanded=label.button.classList.contains('is-expanded'),endX=expanded?x:x-label.button.offsetWidth/2+11,endY=y+(expanded?label.button.offsetHeight/2:9),ex=endX-groundX,ey=endY-groundY;label.leader.style.cssText=`left:${groundX}px;top:${groundY}px;width:${Math.hypot(ex,ey)}px;transform:rotate(${Math.atan2(ey,ex)}rad)`;}
    }

    renderer.render(scene,camera);
    if(!renderer.domElement.dataset.terrainBounds){
      const bounds={};
      for(const [id,item] of islandData){
        const terrain=item.root.children.find(o=>o.geometry?.getAttribute('color'));
        const positions=terrain.geometry.getAttribute('position'),point=new THREE.Vector3();let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(terrain.matrixWorld).project(camera);const x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
        bounds[id]={x:minX,y:minY,width:maxX-minX,height:maxY-minY};
      }
      renderer.domElement.dataset.terrainBounds=JSON.stringify(bounds);
    }
  }
  setActive();raf=requestAnimationFrame(animate);
  const contextLost=e=>{e.preventDefault();onError(new Error('3D 場景暫時無法顯示，請重新整理頁面。'));};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return {
    setActive,setHovered,revealGroup,setTour(value){tour=Boolean(value)&&!reducedMotion;controls.autoRotate=tour&&!mobileLayout;if(!tour){controls.enableDamping=false;controls.update();controls.enableDamping=true;}},resize,
    getMetrics(){return {fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:renderer.getPixelRatio(),islands:5,tour,active:[...active]};},
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();visibilityObserver.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerleave',pointerLeave);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',contextLost);for(const {button,leader} of labels){button.remove();leader.remove();}scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const r of routeResources)r.dispose();for(const r of networkResources)r.dispose();renderer.dispose();renderer.domElement.remove();}
  };
}
