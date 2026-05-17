const log = (message) => {
  const box = document.getElementById('debugBox');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  box.textContent = `[${time}] ${message}\n` + box.textContent;
};

function findLeftSlot(){return document.querySelector('[data-adproof-slot="left-sidebar"]')}
function findMiddleSlot(){return document.querySelector('[data-adproof-slot="middle-sidebar"]')}

function restore(){ window.location.reload(); }

document.addEventListener('click', (event) => {
  const action = event.target?.dataset?.action;
  if (action === 'restore') restore();
});

(function reportInitialState(){
  const left = findLeftSlot();
  const middle = findMiddleSlot();
  const details = [left, middle].filter(Boolean).map((el) => {
    const rect = el.getBoundingClientRect();
    return `${el.dataset.adproofSlot}: ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }).join(' | ');
  log(`Initial static slots ready: ${details}`);
  log('Manual demo buttons removed. Use real SDK, DevTools, uBlock or backend scenarios for validation tests.');
})();
