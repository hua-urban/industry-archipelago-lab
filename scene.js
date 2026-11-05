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
  renderer.toneMappingExposure=1.03;
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
  function outline(cfg){
    const profiles={
      a:[[-11,-2],[-9,2],[-5,4],[1,5],[7,3],[11,0],[8,-3],[3,-4],[-3,-4]],
      b:[[-8,-2],[-7,3],[-4,5],[-1,3],[2,5],[6,3],[8,0],[6,-4],[3,-5],[1,-3],[-2,-5],[-6,-4]],
      c:[[-8,0],[-7,4],[-3,6],[2,6],[7,4],[8,0],[6,-4],[4,-5],[3,-2],[1,0],[-2,0],[-4,-2],[-4,-5],[-7,-4]],
      d:[[-8,-4],[-8,2],[-5,5],[1,5],[7,3],[8,-1],[5,-1],[5,-5],[2,-5],[2,-2],[-1,-2],[-1,-5],[-4,-5],[-4,-3]],
      e:[[-9,-1],[-7,4],[-3,6],[1,5],[5,6],[8,3],[9,-1],[6,-4],[2,-5],[-1,-4],[-5,-5],[-8,-3]]
    };
    const pts=profiles[cfg.id].map(([x,y])=>new THREE.Vector3(x,y,0));
    const curve=new THREE.CatmullRomCurve3(pts,true,'centripetal');
    return new THREE.Shape(curve.getPoints(128).map(v=>new THREE.Vector2(v.x,v.y)));
  }
  for(const cfg of ISLANDS){
    const root=new THREE.Group();root.position.set(cfg.x,0,cfg.z);scene.add(root);
    const own=[];const mat=(color,opts)=>{const m=material(color,opts);own.push({m,color:m.color.clone()});return m;};
    const sand=mat(0xe3d4ac),rock=mat(0x879a83),land=mat(cfg.color),road=mat(0xe5ddc5),walls=mat(0xece7d2),roof=mat(cfg.roof),glass=mat(0x8fb5b1,{roughness:.28,metalness:.1}),wood=mat(0x967b58),leaf=mat(cfg.id==='c'?0x718c6a:0x547955),leafLight=mat(0x88a16b);
    const shape=outline(cfg);
    // One continuous terrain skin: flat settlement, grassy shoulder, tapered beach, submerged rock.
    const contour=shape.getPoints(112);if(contour[0].distanceTo(contour.at(-1))<.001)contour.pop();
    const n=contour.length, terrainPositions=[],terrainColors=[],terrainIndices=[];
    const shoreRandom=rng(cfg.seed), shoreNoise=contour.map((v,i)=>Math.sin(i*.63+cfg.seed)*.018+Math.sin(i*.19)*.022);
    const groundColors=[new THREE.Color(cfg.id==='a'?0xa6ac72:cfg.id==='b'?0x8f9c62:0x66905b),new THREE.Color(0x82a366),new THREE.Color(0xd6c28e),new THREE.Color(0xa59d7d),new THREE.Color(0x657e73)];
    const ringScales=[.82,.94,1.015,1.055,1.08], ringHeights=[.99,.87,.17,-.12,-.48];
    for(let ring=0;ring<5;ring++)for(let i=0;i<n;i++){
      const v=contour[i], noise=shoreNoise[i], scale=ringScales[ring]+(ring?noise:0);
      terrainPositions.push(v.x*scale,ringHeights[ring]+(ring===1?Math.sin(i*.35+cfg.seed)*.10:0),-v.y*scale);
      const c=groundColors[ring].clone().multiplyScalar(.94+Math.sin(i*.47+cfg.seed)*.06);terrainColors.push(c.r,c.g,c.b);
    }
    for(let ring=0;ring<4;ring++)for(let i=0;i<n;i++){const j=(i+1)%n,a=ring*n+i,b=ring*n+j,c=(ring+1)*n+i,d=(ring+1)*n+j;terrainIndices.push(a,c,b,b,c,d);}
    for(const tri of THREE.ShapeUtils.triangulateShape(contour,[]))terrainIndices.push(tri[2],tri[1],tri[0]);
    const terrainGeo=geo(new THREE.BufferGeometry());terrainGeo.setAttribute('position',new THREE.Float32BufferAttribute(terrainPositions,3));terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(terrainColors,3));terrainGeo.setIndex(terrainIndices);terrainGeo.computeVertexNormals();
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
    // Peripheral planted shoulders follow each coastline, away from the settlement core.
    for(let i=0;i<n;i+=isMobile?9:6){
      const v=contour[i],x=v.x*.88,z=-v.y*.88;
      if(cfg.id==='c'&&z>0&&Math.abs(x)<4.5)continue;
      if(cfg.id==='d'&&z>1.8&&Math.abs(x)<4.2)continue;
      if(buildings.some(b=>Math.abs(b.p[0]-x)<b.s[0]/2+.8&&Math.abs(b.p[2]-z)<b.s[2]/2+.8))continue;
      if(Math.abs(x)<.7||Math.abs(z)<.65)continue;
      tree(x,z,.65+random()*.42);
      for(let j=0;j<3;j++)shrubs.push({p:[x+(random()-.5)*1.2,1.02,z+(random()-.5)*.9],s:[.35+random()*.3,.24+random()*.25,.4]});
      hillocks.push({p:[x*.96,.80,z*.96],s:[1.1,.42,.8]});
    }
    for(let i=0;i<n;i+=isMobile?7:4){if(i%13<4)continue;const v=contour[i],sc=1.04+shoreNoise[i];stones.push({p:[v.x*sc,-.02+random()*.17,-v.y*sc],s:[.26+random()*.5,.22+random()*.42,.28+random()*.4],rot:random()*6});}
    if(cfg.id==='a'){
      path([[-8,-.4],[-7,-1.7],[-6.4,-2.4]],.42);pergola(-7,-.8);bench(-7,1.7);
      const crane=mat(0xd6a34e);mesh(box,crane,root,[6.2,2.65,-1.8],[.13,3.3,.13]);mesh(box,crane,root,[5.3,4.25,-1.8],[3.6,.14,.14]);mesh(box,dark,root,[3.8,3.65,-1.8],[.035,1.2,.035]);
      for(let i=0;i<3;i++)mesh(box,stoneMat,root,[-7+i*.65,1.1,2],[.5,.25,.7]);
    }else if(cfg.id==='b'){
      path([[-6,1],[-5.6,2.5],[-3.8,3.3],[-1,3.4],[.5,3]],.4);pergola(0,0);bench(0,-.9);
      for(const x of [-4.5,-2.2,2.6,4.7]){mesh(box,roof,root,[x,2.1,.95],[1.55,.12,.7]);for(let i=0;i<4;i++)flowers.push({p:[x-.5+i*.33,1.23,3.25],s:[.16,.2,.16]});}
    }else if(cfg.id==='c'){
      path([[-6,1],[-5.2,-.3],[-3.8,-.8],[-2,-.9],[0,-.85],[2,-.8],[4,-.5],[6,1]],.5);
      pergola(-5.5,.7);bench(5.6,.3,.3);bench(-5,-.2);
      for(let i=0;i<14;i++){const t=i/13*Math.PI;flowers.push({p:[Math.cos(t)*5,1.14,-3.4-Math.sin(t)*.6],s:[.17,.18,.17]});}
    }else if(cfg.id==='d'){
      makeBuilding(-5.4,-2.7,1.5,1.6,1.1);
      for(let i=0;i<3;i++)mesh(box,i===1?roof:dark,root,[5.3,1.35,1.1+i*.65],[1.3,.65,.5]);
      for(const x of [-2.8,.3]){const hub=new THREE.Group();hub.position.set(x,x<0?4.75:6.95,-1.6);root.add(hub);mesh(cylinder,dark,hub,[0,0,0],[.35,.12,.35]);for(let i=0;i<3;i++){const blade=mesh(box,glass,hub,[0,.1,0],[.12,.06,.65]);blade.rotation.y=i*Math.PI/3;}fans.push(hub);}
      for(const x of [-3,0,3])mesh(box,walls,root,[x+.7,.1,6.4],[.5,.35,1.4]);
    }else{
      for(const x of [-5.3,-4.2,-3.1])for(const z of [-3.7,-4.4])panels.push({p:[x,1.25,z],s:[.85,.12,.48],rot:-.15});
      path([[-4,2],[-5,1],[-5,-.2]],.4);pergola(-3.3,2.6);bench(2.8,4);
      for(let i=0;i<3;i++)mesh(box,leafLight,root,[5+i*.35,1.02+i*.035,-1.2],[.28,.18,2.4]);
    }
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
    for(const {button} of labels){const selected=active.has(button.dataset.island);button.classList.toggle('is-active',selected);button.style.opacity=selected?'1':'.78';button.setAttribute('aria-pressed',String(selected));}
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
      mobileLayout=mobile;controls.autoRotateSpeed=mobile?.17:.21;setActive([...active],currentEdges);
    }}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const visibilityObserver=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;});visibilityObserver.observe(container);
  const projected=new THREE.Vector3();
  function animate(time){if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden||!inViewport){last=time;return;}const dt=Math.min((time-last)/1000,.06);last=time;elapsed+=dt;frames++;if(time-sampleStart>1000){fps=Math.round(frames*1000/(time-sampleStart));frames=0;sampleStart=time;renderer.domElement.dataset.renderMetrics=JSON.stringify({fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries});}
    if(mobileLayout&&tour&&!down){const azimuth=controls.getAzimuthalAngle();if(azimuth>.32)controls.autoRotateSpeed=.17;else if(azimuth<-.32)controls.autoRotateSpeed=-.17;}
    controls.update(dt);
    if(!reducedMotion){const t=elapsed*.035;boat.position.set(Math.sin(t)*43,-.05,Math.cos(t)*34);boat.rotation.y=Math.atan2(Math.cos(t)*43,-Math.sin(t)*34);if(seaMat.userData.shader)seaMat.userData.shader.uniforms.coastTime.value=elapsed*.12;for(const f of fans)f.rotation.y=elapsed*.8;for(const foam of ripples)foam.material.opacity=.42+Math.sin(elapsed*.9)*.08;wake.material.opacity=.35+Math.sin(elapsed*1.7)*.1;}
    else {boat.position.set(8,-.05,32);boat.rotation.y=.8;}
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
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();visibilityObserver.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('webglcontextlost',contextLost);for(const {button} of labels)button.remove();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const r of routeResources)r.dispose();renderer.dispose();renderer.domElement.remove();}
  };
}
