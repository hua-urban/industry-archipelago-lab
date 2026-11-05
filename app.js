import { groups, routes, needs } from './content.js';

const $ = id => document.getElementById(id);
const groupById = new Map(groups.map(group => [group.id, group]));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topicURL = (id, topic) => `${groupById.get(id).url}?topic=${encodeURIComponent(topic)}#explore`;
const routeGroups = route => groups.filter(group => route[group.id]);
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = systemMotion.matches;
let tour = !reducedMotion;
let activeNeed = 'all';
let selectedGroup = 'a';
let expanded = false;
let scene;
let factory;
let rebuilding = 0;
let visibleRoutes = routes;

function updateMotionControls() {
  $('tour').setAttribute('aria-pressed', String(tour));
  $('tour').textContent = tour ? '暫停自動導覽' : '開啟自動導覽';
  $('motion').setAttribute('aria-pressed', String(reducedMotion));
  $('motion').textContent = reducedMotion ? '恢復環境動態' : '減少動態';
}
function updateScene() {
  const ids = activeNeed === 'all' ? groups.map(g => g.id) : [...new Set(visibleRoutes.flatMap(r => routeGroups(r).map(g => g.id)))];
  const edges = activeNeed === 'all' ? [] : visibleRoutes.map(r => {
    const pair = routeGroups(r);
    return {from: pair[0].id, to: pair[1].id};
  });
  scene?.setActive(ids, edges);
}
function renderRoutes() {
  const need = needs.find(n => n.id === activeNeed);
  visibleRoutes = need ? routes.filter(r => need.routeNames.includes(r.name)) : routes;
  $('need-description').textContent = need?.description || '先看五組的共同需求，或選一條你關心的航線。';
  $('route-count').textContent = `${String(visibleRoutes.length).padStart(2,'0')} 條跨組連結`;
  $('map-caption').textContent = need ? `${need.label}：亮起的島與航線，呈現可以接續討論的方向。` : '五座島各自成形，沿著需求找到彼此。';
  $('route-list').innerHTML = visibleRoutes.map((route, index) => {
    const pair = routeGroups(route);
    return `<article class="route-card" ${!expanded && index >= 3 ? 'hidden' : ''}><div class="route-pair"><span>${pair.map(g=>g.id.toUpperCase()).join(' ↔ ')}</span>${pair.map(g=>escapeHTML(g.shortName)).join(' × ')}</div><h3>${escapeHTML(route.name)}</h3><p>${escapeHTML(route.desc)}</p><div class="route-links">${pair.map(g => `<a href="${topicURL(g.id,route[g.id])}">前往${g.id.toUpperCase()}組對應主題 ↗</a>`).join('')}</div></article>`;
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
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.group === id)));
  $('group-detail').style.setProperty('--group-color',group.color);
  $('group-detail').innerHTML = `<div class="group-intro"><span class="group-index">${id.toUpperCase()}</span><h3>${escapeHTML(group.name)}</h3><p class="tagline">${escapeHTML(group.tagline)}</p><p class="description">${escapeHTML(group.description)}</p><a class="visit" href="${group.url}">進入${id.toUpperCase()}組完整動態島 ↗</a></div><div class="topic-grid">${group.topics.map((topic,index)=>`<a class="topic-link" href="${topicURL(id,topic.id)}"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${escapeHTML(topic.title)} ↗</strong><small>${escapeHTML(topic.tagline)}</small></div></a>`).join('')}</div>`;
  const url = new URL(location.href);
  url.searchParams.set('group', id);
  history.replaceState(null,'',url);
  if (scroll) $('explore').scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth'});
}
function setNeed(id) {
  activeNeed = id;
  expanded = false;
  document.querySelectorAll('[data-need]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.need === id)));
  renderRoutes();
}
async function buildScene() {
  const version = ++rebuilding;
  scene?.dispose();
  scene = undefined;
  try {
    factory ||= (await import('./scene.js')).createArchipelago;
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
$('group-tabs').innerHTML = groups.map(group=>`<button type="button" data-group="${group.id}" aria-pressed="false"><span>${group.id.toUpperCase()}</span><strong>${escapeHTML(group.shortName)}</strong></button>`).join('');
$('group-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-group]');if(button)selectGroup(button.dataset.group);});
$('more-routes').addEventListener('click',()=>{expanded=!expanded;renderRoutes();});
$('tour').addEventListener('click',()=>{tour=!tour;if(tour && reducedMotion){reducedMotion=false;buildScene();}else scene?.setTour(tour);updateMotionControls();});
$('motion').addEventListener('click',()=>{reducedMotion=!reducedMotion;if(reducedMotion)tour=false;updateMotionControls();buildScene();});
systemMotion.addEventListener('change',event=>{reducedMotion=event.matches;tour=!reducedMotion;updateMotionControls();buildScene();});
renderRoutes();
const requestedGroup = new URL(location.href).searchParams.get('group');
selectGroup(groupById.has(requestedGroup) ? requestedGroup : selectedGroup);
updateMotionControls();
buildScene();
window.addEventListener('pagehide',()=>scene?.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)buildScene();});
