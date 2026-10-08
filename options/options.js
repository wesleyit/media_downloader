import { getConfig, setConfig, IMAGE_TYPES } from '../lib/storage.js';

const baseFolderInput = document.getElementById('baseFolder');
const organizeInput = document.getElementById('organizeByDomain');
const typesGrid = document.getElementById('typesGrid');
const saveBtn = document.getElementById('save');
const savedMsg = document.getElementById('savedMsg');

function buildTypeCheckboxes(enabledMap) {
  typesGrid.innerHTML = '';
  for (const type of IMAGE_TYPES) {
    const label = document.createElement('label');
    label.className = 'type-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = type;
    input.checked = !!enabledMap[type];

    const span = document.createElement('span');
    span.textContent = type;

    label.appendChild(input);
    label.appendChild(span);
    typesGrid.appendChild(label);
  }
}

function collectTypes() {
  const result = {};
  typesGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    result[input.value] = input.checked;
  });
  return result;
}

async function init() {
  const cfg = await getConfig();
  baseFolderInput.value = cfg.baseFolder;
  organizeInput.checked = cfg.organizeByDomain;
  buildTypeCheckboxes(cfg.imageTypes);
}

saveBtn.addEventListener('click', async () => {
  const baseFolder = baseFolderInput.value.trim() || 'MediaDownloader';
  const imageTypes = collectTypes();

  await setConfig({
    configured: true,
    baseFolder,
    organizeByDomain: organizeInput.checked,
    imageTypes
  });

  baseFolderInput.value = baseFolder;
  savedMsg.hidden = false;
  setTimeout(() => {
    savedMsg.hidden = true;
  }, 2500);
});

init();
