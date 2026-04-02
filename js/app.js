/**
 * app.js — CEM N°83 Asistencia
 * Lógica principal de la interfaz
 */

/* ================================================================
   UTILIDADES
   ================================================================ */
const $ = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const qAll = sel => document.querySelectorAll(sel);

let toastTimer;
function showToast(msg, type = 'default') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function formatFecha(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function nombreCurso(curso) {
  return `${curso.anio}${curso.division}${curso.materia ? ' — ' + curso.materia : ''}`;
}

/* ================================================================
   NAVEGACIÓN
   ================================================================ */
const views     = qAll('.view');
const navBtns   = qAll('.nav-btn');
const navMobile = qAll('.nav-btn-mobile');

function goTo(viewName) {
  views.forEach(v => v.classList.remove('active'));
  navBtns.forEach(b => b.classList.remove('active'));
  navMobile.forEach(b => b.classList.remove('active'));

  const target = $(`view-${viewName}`);
  if (target) target.classList.add('active');

  navBtns.forEach(b => { if (b.dataset.view === viewName) b.classList.add('active'); });
  navMobile.forEach(b => { if (b.dataset.view === viewName) b.classList.add('active'); });

  // cerrar menú mobile
  $('mobileNav').classList.remove('open');

  // acciones al cambiar de vista
  if (viewName === 'cursos')   renderCursosList();
  if (viewName === 'exportar') initExportarView();
  if (viewName === 'historial') initHistorialView();
}

navBtns.forEach(b => b.addEventListener('click', () => goTo(b.dataset.view)));
navMobile.forEach(b => b.addEventListener('click', () => goTo(b.dataset.view)));

// Menú hamburguesa
$('menuToggle').addEventListener('click', () => {
  $('mobileNav').classList.toggle('open');
});

/* ================================================================
   VISTA: TOMAR ASISTENCIA
   ================================================================ */
let activeCursoId   = null;
let activeFecha     = null;
let activeModulo    = null;

// Cuando cambia el módulo → poblar selector de cursos
$('sel-modulo').addEventListener('change', () => {
  const mod = $('sel-modulo').value;
  poblarSelectCurso('sel-curso', mod);
});

function poblarSelectCurso(selectId, modulo, incluyeTodos = false) {
  const sel = $(selectId);
  sel.innerHTML = '';

  if (incluyeTodos) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'Todos';
    sel.appendChild(opt);
  } else {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = modulo ? '— Seleccionar —' : '— Primero seleccioná módulo —';
    sel.appendChild(opt);
  }

  if (!modulo) return;
  const cursos = DB.getCursosByModulo(modulo);
  cursos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nombre}${c.materia ? ' — ' + c.materia : ''}`;
    sel.appendChild(opt);
  });
}

// Fecha por defecto = hoy
$('sel-fecha').value = fechaHoy();

// Cargar lista
$('btn-cargar-lista').addEventListener('click', cargarListaAsistencia);

function cargarListaAsistencia() {
  const modulo  = $('sel-modulo').value;
  const cursoId = $('sel-curso').value;
  const fecha   = $('sel-fecha').value;

  if (!modulo)  return showToast('Seleccioná un módulo', 'error');
  if (!cursoId) return showToast('Seleccioná un curso', 'error');
  if (!fecha)   return showToast('Seleccioná la fecha', 'error');

  const curso = DB.getCursoById(cursoId);
  if (!curso) return showToast('Curso no encontrado', 'error');
  if (!curso.estudiantes.length)
    return showToast('Este curso no tiene estudiantes. Agregá estudiantes en Gestión de Cursos.', 'error');

  activeCursoId = cursoId;
  activeFecha   = fecha;
  activeModulo  = modulo;

  $('panel-titulo').textContent = `Módulo ${modulo} — ${nombreCurso(curso)}`;
  $('panel-fecha').textContent  = `Fecha: ${formatFecha(fecha)}`;

  // Verificar si ya hay asistencia guardada para ese día
  const existente = DB.getAsistenciaExistente(cursoId, fecha);

  renderTablaAsistencia(curso, existente);
  $('attendance-panel').style.display = 'block';
  $('empty-state-tomar').style.display = 'none';
  updateStats();

  if (existente) showToast('ℹ️ Ya hay asistencia guardada para este día. Podés editarla.', 'default');
}

function renderTablaAsistencia(curso, existente) {
  const tbody = $('attendance-body');
  tbody.innerHTML = '';

  curso.estudiantes.forEach((stu, i) => {
    const regExistente = existente
      ? existente.registros.find(r => r.stuId === stu.id)
      : null;
    const estadoActual = regExistente ? regExistente.estado : 'P';
    const obsActual    = regExistente ? regExistente.obs || '' : '';

    const tr = document.createElement('tr');
    tr.dataset.stuId = stu.id;

    tr.innerHTML = `
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${stu.apellido}, ${stu.nombre}</td>
      <td class="td-status">
        <div class="radio-wrap">
          <input type="radio" class="att-radio" name="att-${stu.id}" value="P" id="P-${stu.id}" ${estadoActual === 'P' ? 'checked' : ''}>
          <label class="att-label" for="P-${stu.id}" title="Presente" style="color:var(--present-fg)"></label>
        </div>
      </td>
      <td class="td-status">
        <div class="radio-wrap">
          <input type="radio" class="att-radio" name="att-${stu.id}" value="A" id="A-${stu.id}" ${estadoActual === 'A' ? 'checked' : ''}>
          <label class="att-label" for="A-${stu.id}" title="Ausente" style="color:var(--absent-fg)"></label>
        </div>
      </td>
      <td class="td-status">
        <div class="radio-wrap">
          <input type="radio" class="att-radio" name="att-${stu.id}" value="T" id="T-${stu.id}" ${estadoActual === 'T' ? 'checked' : ''}>
          <label class="att-label" for="T-${stu.id}" title="Tarde" style="color:var(--late-fg)"></label>
        </div>
      </td>
      <td><input type="text" class="obs-input" placeholder="Observación..." value="${obsActual}" data-stu="${stu.id}"></td>
    `;

    // Color de fila según estado
    setRowColor(tr, estadoActual);

    // Cambio de estado actualiza color + stats
    tr.querySelectorAll('.att-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        setRowColor(tr, radio.value);
        updateStats();
      });
    });

    tbody.appendChild(tr);
  });
}

function setRowColor(tr, estado) {
  tr.classList.remove('row-absent', 'row-late');
  if (estado === 'A') tr.classList.add('row-absent');
  if (estado === 'T') tr.classList.add('row-late');
}

function getRegistros() {
  const rows = $('attendance-body').querySelectorAll('tr');
  const registros = [];
  const curso = DB.getCursoById(activeCursoId);

  rows.forEach(tr => {
    const stuId  = tr.dataset.stuId;
    const stu    = curso.estudiantes.find(e => e.id === stuId);
    const estado = tr.querySelector('.att-radio:checked')?.value || 'P';
    const obs    = tr.querySelector('.obs-input')?.value || '';
    registros.push({
      stuId,
      apellido: stu?.apellido || '',
      nombre:   stu?.nombre || '',
      estado,
      obs
    });
  });
  return registros;
}

function updateStats() {
  const regs    = getRegistros();
  const present = regs.filter(r => r.estado === 'P').length;
  const absent  = regs.filter(r => r.estado === 'A').length;
  const late    = regs.filter(r => r.estado === 'T').length;
  $('stat-present').textContent = `Presentes: ${present}`;
  $('stat-absent').textContent  = `Ausentes: ${absent}`;
  $('stat-late').textContent    = `Tardanzas: ${late}`;
}

function guardarAsistencia() {
  if (!activeCursoId) return;
  const registros = getRegistros();
  const result = DB.guardarAsistencia({
    cursoId: activeCursoId,
    modulo: activeModulo,
    fecha: activeFecha,
    registros
  });
  if (result.ok) {
    showToast('✅ Asistencia guardada correctamente', 'success');
  } else {
    showToast('Error al guardar', 'error');
  }
}

$('btn-guardar').addEventListener('click', guardarAsistencia);
$('btn-guardar-2').addEventListener('click', guardarAsistencia);

$('btn-all-present').addEventListener('click', () => {
  const rows = $('attendance-body').querySelectorAll('tr');
  rows.forEach(tr => {
    const radio = tr.querySelector(`input[type="radio"][value="P"]`);
    if (radio) radio.checked = true;
    setRowColor(tr, 'P');
  });
  updateStats();
  showToast('Todos marcados como presentes');
});

/* ================================================================
   VISTA: GESTIÓN DE CURSOS
   ================================================================ */
let cursoEditandoId = null;

function renderCursosList() {
  const container = $('cursos-list');
  const cursos = DB.getCursos().sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre));

  if (!cursos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px;padding:8px 0">Aún no hay cursos creados.</p>';
    return;
  }

  container.innerHTML = '';
  const porModulo = {};
  cursos.forEach(c => {
    if (!porModulo[c.modulo]) porModulo[c.modulo] = [];
    porModulo[c.modulo].push(c);
  });

  Object.entries(porModulo).forEach(([mod, arr]) => {
    const label = document.createElement('p');
    label.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin:14px 0 6px';
    label.textContent = `Módulo ${mod}`;
    container.appendChild(label);

    arr.forEach(curso => {
      const div = document.createElement('div');
      div.className = 'curso-item';
      div.innerHTML = `
        <div class="curso-badge">M${curso.modulo}</div>
        <div class="curso-info">
          <div class="curso-name">${curso.nombre}${curso.materia ? ' — ' + curso.materia : ''}</div>
          <div class="curso-meta">${curso.estudiantes.length} estudiante${curso.estudiantes.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="curso-actions">
          <button class="btn-add-stu" data-id="${curso.id}">👤 Estudiantes</button>
          <button class="btn-danger" data-del="${curso.id}" title="Eliminar curso">✕</button>
        </div>
      `;
      container.appendChild(div);
    });
  });

  // Events
  container.querySelectorAll('.btn-add-stu').forEach(btn => {
    btn.addEventListener('click', () => abrirPanelEstudiantes(btn.dataset.id));
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => confirmarEliminarCurso(btn.dataset.del));
  });
}

function confirmarEliminarCurso(id) {
  const curso = DB.getCursoById(id);
  if (!curso) return;
  if (!confirm(`¿Eliminar el curso ${curso.nombre}? Esto eliminará TODAS sus asistencias guardadas.`)) return;
  DB.eliminarCurso(id);
  renderCursosList();
  showToast('Curso eliminado');
  if (cursoEditandoId === id) {
    cursoEditandoId = null;
    $('card-estudiantes').style.display = 'none';
  }
}

$('btn-crear-curso').addEventListener('click', () => {
  const modulo   = $('cur-modulo').value;
  const anio     = $('cur-anio').value;
  const division = $('cur-division').value;
  const materia  = $('cur-materia').value.trim();

  const result = DB.crearCurso({ modulo, anio, division, materia });
  if (!result.ok) return showToast(result.msg, 'error');

  showToast(`✅ Curso ${anio}${division} creado en Módulo ${modulo}`, 'success');
  renderCursosList();
  $('cur-materia').value = '';
  abrirPanelEstudiantes(result.curso.id);
});

/* ---- PANEL ESTUDIANTES ---- */
function abrirPanelEstudiantes(cursoId) {
  cursoEditandoId = cursoId;
  const curso = DB.getCursoById(cursoId);
  if (!curso) return;
  $('cur-selected-name').textContent = `${nombreCurso(curso)} (Módulo ${curso.modulo})`;
  $('card-estudiantes').style.display = 'block';
  $('card-estudiantes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderEstudiantesList(curso);
}

function renderEstudiantesList(curso) {
  const container = $('stu-list-container');
  if (!curso.estudiantes.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">Sin estudiantes. Agregá el primero.</p>';
    return;
  }
  container.innerHTML = '';
  curso.estudiantes.forEach((stu, i) => {
    const div = document.createElement('div');
    div.className = 'stu-item';
    div.innerHTML = `
      <span class="stu-num">${i + 1}</span>
      <span class="stu-name">${stu.apellido}, ${stu.nombre}</span>
      <button class="btn-danger" data-del="${stu.id}" title="Eliminar">✕</button>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('¿Eliminar este estudiante?')) return;
      DB.eliminarEstudiante(cursoEditandoId, btn.dataset.del);
      const c = DB.getCursoById(cursoEditandoId);
      renderEstudiantesList(c);
      renderCursosList();
      showToast('Estudiante eliminado');
    });
  });
}

$('btn-agregar-stu').addEventListener('click', () => {
  const apellido = $('stu-apellido').value.trim();
  const nombre   = $('stu-nombre').value.trim();
  if (!apellido || !nombre) return showToast('Completá apellido y nombre', 'error');
  if (!cursoEditandoId)     return showToast('Seleccioná un curso primero', 'error');

  const result = DB.agregarEstudiante(cursoEditandoId, { apellido, nombre });
  if (!result.ok) return showToast(result.msg, 'error');

  $('stu-apellido').value = '';
  $('stu-nombre').value   = '';
  $('stu-apellido').focus();
  const c = DB.getCursoById(cursoEditandoId);
  renderEstudiantesList(c);
  renderCursosList();
  showToast(`✅ ${apellido}, ${nombre} agregado/a`, 'success');
});

// Enter en campos de estudiante
['stu-apellido', 'stu-nombre'].forEach(id => {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-agregar-stu').click();
  });
});

/* ---- IMPORTAR DESDE TEXTO ---- */
$('btn-import-txt').addEventListener('click', () => {
  $('import-modal').style.display = 'block';
  $('import-textarea').focus();
});

$('btn-import-cancel').addEventListener('click', () => {
  $('import-modal').style.display = 'none';
  $('import-textarea').value = '';
});

$('btn-import-confirm').addEventListener('click', () => {
  const text = $('import-textarea').value.trim();
  if (!text) return showToast('La lista está vacía', 'error');
  if (!cursoEditandoId) return showToast('Seleccioná un curso primero', 'error');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let count = 0;
  lines.forEach(line => {
    let apellido = '', nombre = '';
    if (line.includes(',')) {
      [apellido, nombre] = line.split(',').map(s => s.trim());
    } else {
      const parts = line.split(/\s+/);
      apellido = parts[0] || '';
      nombre   = parts.slice(1).join(' ') || '';
    }
    if (apellido && nombre) {
      const r = DB.agregarEstudiante(cursoEditandoId, { apellido, nombre });
      if (r.ok) count++;
    }
  });

  $('import-modal').style.display = 'none';
  $('import-textarea').value = '';
  const c = DB.getCursoById(cursoEditandoId);
  renderEstudiantesList(c);
  renderCursosList();
  showToast(`✅ ${count} estudiante${count !== 1 ? 's' : ''} importado${count !== 1 ? 's' : ''}`, 'success');
});

/* ================================================================
   VISTA: HISTORIAL
   ================================================================ */
function initHistorialView() {
  poblarSelectCurso('his-curso', '', true);
  poblarAllCursos('his-curso');
}

function poblarAllCursos(selectId) {
  const sel = $(selectId);
  sel.innerHTML = '<option value="">Todos</option>';
  DB.getCursos()
    .sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre))
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `M${c.modulo} — ${c.nombre}${c.materia ? ' — ' + c.materia : ''}`;
      sel.appendChild(opt);
    });
}

$('his-modulo').addEventListener('change', () => {
  const mod = $('his-modulo').value;
  if (mod) {
    poblarSelectCurso('his-curso', mod, true);
  } else {
    poblarAllCursos('his-curso');
  }
});

$('btn-filtrar-his').addEventListener('click', () => {
  const modulo  = $('his-modulo').value;
  const cursoId = $('his-curso').value;
  const desde   = $('his-desde').value;
  const hasta   = $('his-hasta').value;

  const asistencias = DB.getAsistenciasByFilter({ modulo, cursoId, desde, hasta });
  renderHistorial(asistencias);
});

function renderHistorial(asistencias) {
  const container = $('historial-resultados');
  if (!asistencias.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <p>No se encontraron registros con los filtros aplicados.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  asistencias.forEach(a => {
    const curso   = DB.getCursoById(a.cursoId);
    const present = a.registros.filter(r => r.estado === 'P').length;
    const absent  = a.registros.filter(r => r.estado === 'A').length;
    const late    = a.registros.filter(r => r.estado === 'T').length;
    const ausentes = a.registros.filter(r => r.estado === 'A');
    const tardes   = a.registros.filter(r => r.estado === 'T');

    const div = document.createElement('div');
    div.className = 'his-entry';
    div.innerHTML = `
      <div class="his-header">
        <div>
          <div class="his-title">Módulo ${a.modulo} — ${curso ? nombreCurso(curso) : a.cursoId}</div>
          <div class="his-date">${formatFecha(a.fecha)}</div>
        </div>
        <div class="his-stats">
          <span class="his-stat p">✅ ${present}</span>
          <span class="his-stat a">❌ ${absent}</span>
          <span class="his-stat t">⏰ ${late}</span>
        </div>
      </div>
      <div class="his-detail">
        ${ausentes.length ? `
          <p style="font-size:12px;font-weight:700;color:var(--absent-fg);margin-bottom:6px">Ausentes:</p>
          <div class="his-list">
            ${ausentes.map(r => `<span class="his-stu a">${r.apellido}, ${r.nombre}${r.obs ? ' (' + r.obs + ')' : ''}</span>`).join('')}
          </div>
        ` : ''}
        ${tardes.length ? `
          <p style="font-size:12px;font-weight:700;color:var(--late-fg);margin:10px 0 6px">Tardanzas:</p>
          <div class="his-list">
            ${tardes.map(r => `<span class="his-stu t">${r.apellido}, ${r.nombre}${r.obs ? ' (' + r.obs + ')' : ''}</span>`).join('')}
          </div>
        ` : ''}
        ${!ausentes.length && !tardes.length ? '<p style="font-size:13px;color:var(--text-muted)">Todos presentes ✅</p>' : ''}
      </div>
      <div class="his-entry-actions">
        <button class="btn-danger" data-del-asis="${a.id}">🗑 Eliminar registro</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-del-asis]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('¿Eliminar este registro de asistencia?')) return;
      DB.eliminarAsistencia(btn.dataset.delAsis);
      $('btn-filtrar-his').click();
      showToast('Registro eliminado');
    });
  });
}

/* ================================================================
   VISTA: EXPORTAR
   ================================================================ */
function initExportarView() {
  poblarAllCursos('exp-curso');
  renderResumenGeneral();
}

$('exp-modulo').addEventListener('change', () => {
  const mod = $('exp-modulo').value;
  if (mod) poblarSelectCurso('exp-curso', mod, true);
  else poblarAllCursos('exp-curso');
});

function renderResumenGeneral() {
  const cursos = DB.getCursos();
  const total  = DB.getAsistencias().length;
  const container = $('resumen-general');

  if (!cursos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No hay datos cargados aún.</p>';
    return;
  }

  let html = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Total de registros de asistencia guardados: <strong>${total}</strong></p>
    <table class="resumen-table">
      <thead>
        <tr>
          <th>Módulo</th>
          <th>Curso</th>
          <th>Estudiantes</th>
          <th>Días registrados</th>
        </tr>
      </thead>
      <tbody>
  `;

  cursos
    .sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre))
    .forEach(c => {
      const dias = DB.getAsistenciasByFilter({ cursoId: c.id }).length;
      html += `
        <tr>
          <td>Módulo ${c.modulo}</td>
          <td>${c.nombre}${c.materia ? ' — ' + c.materia : ''}</td>
          <td>${c.estudiantes.length}</td>
          <td>${dias}</td>
        </tr>
      `;
    });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ================================================================
   PWA INSTALL PROMPT
   ================================================================ */
let deferredPrompt;
const PWA_HIDE_KEY = 'cem83_pwa_hide_until';
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 horas

window.addEventListener('beforeinstallprompt', e => {
  console.log('PWA: Evento beforeinstallprompt detectado ✅');
  e.preventDefault();
  deferredPrompt = e;

  // Verificar si el usuario cerró el banner recientemente
  const hideUntil = localStorage.getItem(PWA_HIDE_KEY);
  const now = Date.now();

  if (!hideUntil || now > parseInt(hideUntil, 10)) {
    showInstallBanner();
  } else {
    console.log('PWA: Banner en periodo de espera (cooldown)');
  }
});

function showInstallBanner() {
  if ($('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #15803d; color: white; padding: 16px;
    display: flex; justify-content: space-between; align-items: center;
    z-index: 10000; box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
    font-family: inherit; border-top-left-radius: 12px; border-top-right-radius: 12px;
    animation: slideUpPWA 0.4s ease-out;
  `;

  banner.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px">
      <span style="font-size:24px">📲</span>
      <div>
        <div style="font-weight:700; font-size:15px">Instalar CEM 83</div>
        <div style="font-size:12px; opacity:0.9">Accedé más rápido y sin internet.</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:12px">
      <button id="pwa-install-btn" style="background:white; color:#15803d; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer; font-size:14px">Instalar</button>
      <button id="pwa-close-btn" style="background:transparent; color:white; border:none; font-size:20px; cursor:pointer; padding:4px">✕</button>
    </div>
    <style>
      @keyframes slideUpPWA { from { transform: translateY(100%); } to { transform: translateY(0); } }
    </style>
  `;

  document.body.appendChild(banner);

  // Lógica de instalación
  $('pwa-install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') banner.remove();
    deferredPrompt = null;
  });

  // Lógica de cierre con persistencia de 12 horas
  $('pwa-close-btn').addEventListener('click', () => {
    localStorage.setItem(PWA_HIDE_KEY, (Date.now() + COOLDOWN_MS).toString());
    banner.remove();
  });
}

window.addEventListener('appinstalled', () => {
  const banner = $('pwa-install-banner');
  if (banner) banner.remove();
  showToast('✅ App instalada correctamente', 'success');
  deferredPrompt = null;
});

/* ================================================================
   INIT
   ================================================================ */
goTo('tomar');