// ======== Estado ========
const canvas = document.getElementById('shirtCanvas');
const ctx = canvas.getContext('2d');

// Controles
const shirtColorInput = document.getElementById('shirtColor');
const imgUpload = document.getElementById('imgUpload');
const imgFilterSelect = document.getElementById('imgFilter');
const btnBringForward = document.getElementById('bringForward');
const btnSendBackward = document.getElementById('sendBackward');
const btnDelete = document.getElementById('deleteObj');
const btnClearAll = document.getElementById('clearAll');
const btnSave = document.getElementById('savePNG');

// Lista de objetos na camisa (apenas imagens neste demo)
const objects = []; // { img, x, y, w, h, scaleX, scaleY, rotation, filter }
let selectedIndex = -1;

// Alça de redimensionamento
const HANDLE_SIZE = 14;

// ======== Base da camisa: path vetorial + tint ========
function drawShirtBase(color = '#ffffff') {
  // Camada 1: forma básica em cinza claro (textura/base)
  ctx.save();
  ctx.translate(canvas.width / 2, 420); // centro aproximado

  ctx.fillStyle = '#e5e7eb';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;

  ctx.beginPath();
  // Desenha um "T-shirt" simples (ombros + corpo)
  // gola
  ctx.moveTo(-60, -180);
  ctx.quadraticCurveTo(0, -220, 60, -180);

  // ombro direito
  ctx.lineTo(170, -150);
  ctx.quadraticCurveTo(210, -135, 190, -90);
  ctx.lineTo(140, -70);

  // lateral direita até a barra
  ctx.quadraticCurveTo(120, 120, 0, 210);

  // lateral esquerda até a manga
  ctx.quadraticCurveTo(-120, 120, -140, -70);
  ctx.lineTo(-190, -90);
  ctx.quadraticCurveTo(-210, -135, -170, -150);

  // volta para gola
  ctx.lineTo(-60, -180);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Camada 2: tinta (tint) multiplicando sobre a base
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.translate(canvas.width / 2, 420);
  ctx.beginPath();
  ctx.moveTo(-60, -180);
  ctx.quadraticCurveTo(0, -220, 60, -180);
  ctx.lineTo(170, -150);
  ctx.quadraticCurveTo(210, -135, 190, -90);
  ctx.lineTo(140, -70);
  ctx.quadraticCurveTo(120, 120, 0, 210);
  ctx.quadraticCurveTo(-120, 120, -140, -70);
  ctx.lineTo(-190, -90);
  ctx.quadraticCurveTo(-210, -135, -170, -150);
  ctx.lineTo(-60, -180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Camada 3: brilho leve por cima para dar vida
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.translate(canvas.width / 2, 420);
  ctx.beginPath();
  ctx.moveTo(-40, -160);
  ctx.quadraticCurveTo(0, -190, 40, -160);
  ctx.quadraticCurveTo(50, -60, 0, -30);
  ctx.quadraticCurveTo(-50, -60, -40, -160);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ======== Redesenha tudo ========
function render() {
  // background do canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Camisa base
  drawShirtBase(shirtColorInput.value);

  // Objetos (imagens)
  objects.forEach((o, i) => drawObject(o, i === selectedIndex));
}

// Desenha um objeto (imagem) com transformações + seleção
function drawObject(o, isSelected) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rotation);
  ctx.scale(o.scaleX, o.scaleY);

  // Aplica filtro da imagem via ctx.filter
  ctx.filter = o.filter; // 'none' | 'grayscale(1)' | 'sepia(1)' etc.

  // Desenha imagem centralizada na origem
  const drawX = -o.w / 2;
  const drawY = -o.h / 2;
  ctx.drawImage(o.img, drawX, drawY, o.w, o.h);

  // Reset filter para desenhar seleção limpa
  ctx.filter = 'none';

  // Seleção
  if (isSelected) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX, drawY, o.w, o.h);

    // Alça de redimensionamento (canto inferior direito)
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(drawX + o.w - HANDLE_SIZE/2, drawY + o.h - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
  }

  ctx.restore();
}

// ======== Helpers de hit-test ========
function pointToObject(px, py, o) {
  // Converte o ponto (px,py) do espaço do canvas para o espaço do objeto
  const dx = px - o.x;
  const dy = py - o.y;
  const cos = Math.cos(-o.rotation);
  const sin = Math.sin(-o.rotation);
  const rx = (dx * cos - dy * sin) / o.scaleX;
  const ry = (dx * sin + dy * cos) / o.scaleY;

  // Agora testamos contra o retângulo da imagem centralizado
  const left = -o.w / 2;
  const top  = -o.h / 2;

  const inside = (rx >= left && rx <= left + o.w && ry >= top && ry <= top + o.h);
  let onHandle = false;

  if (inside) {
    const hx = left + o.w - HANDLE_SIZE/2;
    const hy = top  + o.h - HANDLE_SIZE/2;
    if (rx >= hx && rx <= hx + HANDLE_SIZE && ry >= hy && ry <= hy + HANDLE_SIZE) {
      onHandle = true;
    }
  }
  return { inside, onHandle, rx, ry };
}

// ======== Interação (mouse) ========
let isDragging = false;
let isResizing = false;
let dragOffsetX = 0, dragOffsetY = 0;
let startMouseX = 0, startMouseY = 0;
let startW = 0, startH = 0;

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  let clickedIndex = -1;
  let clickedHandle = false;

  // Percorrer de frente pra trás para priorizar os objetos no topo
  for (let i = objects.length - 1; i >= 0; i--) {
    const test = pointToObject(mx, my, objects[i]);
    if (test.inside) {
      clickedIndex = i;
      clickedHandle = test.onHandle;
      // Guardar offsets para drag
      dragOffsetX = test.rx;
      dragOffsetY = test.ry;
      break;
    }
  }

  selectedIndex = clickedIndex;
  if (selectedIndex >= 0) {
    if (clickedHandle) {
      // Inicia resize
      isResizing = true;
      isDragging = false;
      startMouseX = mx;
      startMouseY = my;
      startW = objects[selectedIndex].w;
      startH = objects[selectedIndex].h;
    } else {
      // Inicia drag
      isDragging = true;
      isResizing = false;
    }
  } else {
    // clicou fora: deselecionar
    isDragging = false;
    isResizing = false;
  }

  render();
});

canvas.addEventListener('mousemove', (e) => {
  if (selectedIndex < 0) return;
  const o = objects[selectedIndex];
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (isDragging) {
    // mover mantendo offset relativo
    // Precisamos converter o offset de volta ao espaço global
    const cos = Math.cos(o.rotation);
    const sin = Math.sin(o.rotation);
    const gx = (dragOffsetX * o.scaleX) * cos + (dragOffsetY * o.scaleY) * -sin;
    const gy = (dragOffsetX * o.scaleX) * sin + (dragOffsetY * o.scaleY) * cos;

    o.x = mx - gx;
    o.y = my - gy;
    render();
  } else if (isResizing) {
    // redimensionar proporcional (Shift para manter proporção)
    const dx = mx - startMouseX;
    const dy = my - startMouseY;
    const keepRatio = e.shiftKey;

    if (keepRatio) {
      const delta = Math.max(dx, dy);
      o.w = Math.max(20, startW + delta);
      o.h = Math.max(20, startH + delta * (startH / startW));
    } else {
      o.w = Math.max(20, startW + dx);
      o.h = Math.max(20, startH + dy);
    }
    render();
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  isResizing = false;
});

// ======== Upload de imagem ========
imgUpload.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    const ratio = img.width / img.height;
    const baseW = 240;
    const baseH = Math.round(baseW / ratio);

    const obj = {
      img,
      x: canvas.width / 2,
      y: 430, // centro aproximado da camisa
      w: baseW,
      h: baseH,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      filter: 'none'
    };
    objects.push(obj);
    selectedIndex = objects.length - 1;
    imgUpload.value = '';
    render();
  };
  img.src = URL.createObjectURL(file);
});

// ======== Filtro na imagem selecionada ========
imgFilterSelect.addEventListener('change', () => {
  if (selectedIndex < 0) return;
  objects[selectedIndex].filter = imgFilterSelect.value;
  render();
});

// ======== Z-order ========
btnBringForward.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  if (selectedIndex < objects.length - 1) {
    const [obj] = objects.splice(selectedIndex, 1);
    objects.splice(selectedIndex + 1, 0, obj);
    selectedIndex++;
    render();
  }
});
btnSendBackward.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  if (selectedIndex > 0) {
    const [obj] = objects.splice(selectedIndex, 1);
    objects.splice(selectedIndex - 1, 0, obj);
    selectedIndex--;
    render();
  }
});

// ======== Remover / Limpar ========
btnDelete.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  objects.splice(selectedIndex, 1);
  selectedIndex = -1;
  render();
});

btnClearAll.addEventListener('click', () => {
  objects.length = 0;
  selectedIndex = -1;
  render();
});

// ======== Cor da camisa ========
shirtColorInput.addEventListener('input', render);

// ======== Salvar PNG ========
btnSave.addEventListener('click', () => {
  // O próprio canvas já tem tudo desenhado
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'camisa_canvas.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// ======== Inicializa ========
render();
