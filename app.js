import { groups, routes, needs, identities } from './content.js';

const $ = id => document.getElementById(id);
const groupById = new Map(groups.map(group => [group.id, group]));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topicURL = (id, topic) => `${groupById.get(id).url}?topic=${encodeURIComponent(topic)}#explore`;
const routeGroups = route => groups.filter(group => route[group.id]);
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = systemMotion.matches;
let tour = !reducedMotion;
let activeNeed = 'all';
let routeIndex = 0;
let collaborationPath = 'case';
let selectedGroup = 'a';
let expanded = false;
let scene;
let factory;
let rebuilding = 0;
let visibleRoutes = routes;

function updateMotionControls() {
  $('tour').setAttribute('aria-pressed', String(tour));
  $('tour').textContent = tour ? '暫停海域動態' : '開啟海域動態';
  $('motion').setAttribute('aria-pressed', String(reducedMotion));
  $('motion').textContent = reducedMotion ? '恢復環境動態' : '減少動態';
}
function renderWorkflow() {
  const steps = collaborationPath === 'case' ? ['一案一主責','依需求邀隊友','交付與回顧'] : ['鎖定目標客群','聯合講座或拜訪','形成新需求'];
  $('workflow').innerHTML = `<span>${collaborationPath==='case'?'共同承接':'共同開發'}</span><p>${steps.map((step,index)=>`<b>${String(index+1).padStart(2,'0')}</b> ${step}`).join('<i aria-hidden="true">→</i>')}</p><small>${collaborationPath==='case'?'由主責作為單一窗口，接續需求、夥伴與交付。':'以選定需求為討論主題，規劃聯合行動；不代表已有案件。'}</small>`;
}
function updateScene() {
  const route = visibleRoutes[routeIndex];
  const pair = routeGroups(route);
  scene?.setActive(pair.map(g => g.id), [{from:pair[0].id,to:pair[1].id}]);
  $('relay-position').textContent = `${String(routeIndex+1).padStart(2,'0')} / ${String(visibleRoutes.length).padStart(2,'0')}`;
  $('relay-content').innerHTML = `<strong>${escapeHTML(route.name)}</strong><div class="relay-pair">${pair.map(g=>`<button type="button" data-relay-group="${g.id}"><b>${g.id.toUpperCase()}</b>${escapeHTML(g.shortName)}</button>`).join('<span class="relay-arrow" aria-hidden="true">↔</span>')}</div><p>${escapeHTML(route.desc)}</p>`;
  document.querySelectorAll('[data-route]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.route) === routeIndex)));
}
function renderRoutes() {
  const need = needs.find(n => n.id === activeNeed);
  visibleRoutes = need ? routes.filter(r => need.routeNames.includes(r.name)) : routes;
  $('need-description').textContent = need?.description || '先看五組的共同需求，或選一條你關心的航線。';
  $('route-count').textContent = `${String(visibleRoutes.length).padStart(2,'0')} 條跨組連結`;
  $('map-caption').textContent = need ? `${need.label}：亮起的島與航線，呈現可以接續討論的方向。` : '五座島各自成形，沿著需求找到彼此。';
  $('route-list').innerHTML = visibleRoutes.map((route, index) => {
    const pair = routeGroups(route);
    return `<article class="route-card" ${!expanded && index >= 3 ? 'hidden' : ''}><div class="route-pair"><span>${pair.map(g=>g.id.toUpperCase()).join(' ↔ ')}</span>${pair.map(g=>escapeHTML(g.shortName)).join(' × ')}</div><h3>${escapeHTML(route.name)}</h3><button type="button" class="route-preview" data-route="${index}" aria-pressed="${index===routeIndex}">在海域看接棒 ↗</button><p>${escapeHTML(route.desc)}</p><div class="route-links">${pair.map(g => `<a href="${topicURL(g.id,route[g.id])}">前往${g.id.toUpperCase()}組對應主題 ↗</a>`).join('')}</div></article>`;
  }).join('');
  $('more-routes').hidden = visibleRoutes.length <= 3;
  $('more-routes').setAttribute('aria-expanded',String(expanded));
  $('more-routes').textContent = expanded ? '收起部分連結 ↑' : `展開全部 ${visibleRoutes.length} 條連結 ↓`;
  updateScene();
}
function selectGroup(id, scroll = false) {
  if (!groupById.has(id)) return;
  selectedGroup = id;
  const group = groupById.get(id);
  const identity = identities[id];
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.group === id)));
  $('group-detail').style.setProperty('--group-color',group.color);
  $('group-detail').innerHTML = `<div class="group-intro"><span class="group-index">${id.toUpperCase()}</span><h3>${escapeHTML(group.name)}</h3><p class="island-identity">${escapeHTML(identity.motif)}</p><p class="tagline">${escapeHTML(group.tagline)}</p><p class="description">${escapeHTML(group.description)}</p><div class="handoff"><small>這座島如何接棒</small><p>${escapeHTML(identity.handoff)}</p></div><p class="source-line">${escapeHTML(identity.source)}・造景為視覺轉譯</p><a class="visit" href="${group.url}">進入${id.toUpperCase()}組完整動態島 ↗</a></div><div class="topic-grid">${group.topics.map((topic,index)=>`<a class="topic-link" href="${topicURL(id,topic.id)}"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${escapeHTML(topic.title)} ↗</strong><small>${escapeHTML(topic.tagline)}</small></div></a>`).join('')}</div>`;
  const url = new URL(location.href);
  url.searchParams.set('group', id);
  history.replaceState(null,'',url);
  if (scroll) $('explore').scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth'});
}
function setNeed(id) {
  activeNeed = id;
  routeIndex = 0;
  expanded = false;
  document.querySelectorAll('[data-need]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.need === id)));
  renderRoutes();
}
async function buildScene() {
  const version = ++rebuilding;
  scene?.dispose();
  scene = undefined;
  try {
    factory ||= (await import('./scene.js?v=relay3')).createArchipelago;
    if (version !== rebuilding) return;
    scene = factory({container: $('scene'), reducedMotion, onSelect: id => selectGroup(id,true), onError: showFallback});
    $('tour').disabled = false;
    $('motion').disabled = false;
    $('scene-status')?.remove();
    $('scene').classList.remove('is-fallback');
    scene.setTour(tour);
    updateScene();
  } catch (error) {
    console.warn('3D overview unavailable:',error.message);
    showFallback();
  }
}
function showFallback() {
  scene?.dispose();
  scene = undefined;
  $('scene').classList.add('is-fallback');
  if (!$('scene-status')) {
    const message = document.createElement('p');
    message.id = 'scene-status'; message.className = 'scene-status'; message.setAttribute('role','status');
    $('scene').append(message);
  }
  $('scene-status').textContent = '這台裝置暫時無法顯示 3D 海域。下方仍可探索五組與全部主題。';
  $('tour').disabled = true;
  $('motion').disabled = true;
}
$('needs').innerHTML = [{id:'all',label:'全部航線'},...needs].map(need=>`<button type="button" data-need="${escapeHTML(need.id)}" aria-pressed="${need.id==='all'}">${escapeHTML(need.label)}</button>`).join('');
$('map-needs').innerHTML = $('needs').innerHTML;
$('map-needs').addEventListener('click',event=>{const button=event.target.closest('[data-need]');if(button)setNeed(button.dataset.need);});
$('needs').addEventListener('click',event=>{const button=event.target.closest('[data-need]');if(button)setNeed(button.dataset.need);});
$('group-tabs').innerHTML = groups.map(group=>`<button type="button" data-group="${group.id}" aria-pressed="false"><span>${group.id.toUpperCase()}</span><strong>${escapeHTML(group.shortName).replace(/^(.{2})(.+)$/,"$1<wbr>$2")}</strong></button>`).join('');
$('group-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-group]');if(button)selectGroup(button.dataset.group);});
document.querySelector('.path-buttons').addEventListener('click',event=>{const button=event.target.closest('[data-path]');if(!button)return;collaborationPath=button.dataset.path;document.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.path===collaborationPath)));renderWorkflow();});
$('relay-prev').addEventListener('click',()=>{routeIndex=(routeIndex+visibleRoutes.length-1)%visibleRoutes.length;updateScene();});
$('relay-next').addEventListener('click',()=>{routeIndex=(routeIndex+1)%visibleRoutes.length;updateScene();});
$('relay-content').addEventListener('click',event=>{const button=event.target.closest('[data-relay-group]');if(button)selectGroup(button.dataset.relayGroup,true);});
$('route-list').addEventListener('click',event=>{const button=event.target.closest('[data-route]');if(button){routeIndex=Number(button.dataset.route);updateScene();$('scene').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'center'});}});
$('more-routes').addEventListener('click',()=>{expanded=!expanded;renderRoutes();});
$('tour').addEventListener('click',()=>{tour=!tour;if(tour && reducedMotion){reducedMotion=false;buildScene();}else scene?.setTour(tour);updateMotionControls();});
$('motion').addEventListener('click',()=>{reducedMotion=!reducedMotion;if(reducedMotion)tour=false;updateMotionControls();buildScene();});
systemMotion.addEventListener('change',event=>{reducedMotion=event.matches;tour=!reducedMotion;updateMotionControls();buildScene();});
renderRoutes();
renderWorkflow();
const requestedGroup = new URL(location.href).searchParams.get('group');
selectGroup(groupById.has(requestedGroup) ? requestedGroup : selectedGroup);
updateMotionControls();
buildScene();
window.addEventListener('pagehide',()=>scene?.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)buildScene();});
