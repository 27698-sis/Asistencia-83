/**
 * app.js - CEM N°83 Asistencia
 * Logica principal de la interfaz
 */

/* ================================================================
   UTILIDADES
   ================================================================ */
const $ = id => document.getElementById(id);
const qAll = sel => document.querySelectorAll(sel);

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

let toastTimer;
let activeCursoId = null;
let activeFecha = null;
let activeModulo = null;
let cursoEditandoId = null;
let deferredPrompt = null;

function showToast(msg, type = 'default') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char]);
}

function handleUnexpectedError(error) {
  console.error(error);
  showToast('Ocurrio un error inesperado', 'error');
}

function runTask(task) {
  Promise.resolve().then(task).catch(handleUnexpectedError);
}

function formatFecha(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function fechaHoy() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function nombreCurso(curso) {
  return `${curso.anio}${curso.division}${curso.materia ? ' - ' + curso.materia : ''}`;
}

function crearOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

function renderMensajeVacio(container, icono, mensaje) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">${icono}</div>
      <p>${mensaje}</p>
    </div>
  `;
}

function setLoadingState(isLoading) {
  document.body.classList.toggle('app-loading', isLoading);
}

/* ================================================================
   NAVEGACION
   ================================================================ */
const views = qAll('.view');
const navBtns = qAll('.nav-btn');
const navMobile = qAll('.nav-btn-mobile');

async function goTo(viewName) {
  views.forEach(view => view.classList.remove('active'));
  navBtns.forEach(btn => btn.classList.remove('active'));
  navMobile.forEach(btn => btn.classList.remove('active'));

  const target = $(`view-${viewName}`);
  if (target) target.classList.add('active');

  navBtns.forEach(btn => {
    if (btn.dataset.view === viewName) btn.classList.add('active');
  });

  navMobile.forEach(btn => {
    if (btn.dataset.view === viewName) btn.classList.add('active');
  });

  $('mobileNav').classList.remove('open');

  if (viewName === 'cursos') await renderCursosList();
  if (viewName === 'historial') await initHistorialView();
  if (viewName === 'exportar') await initExportarView();
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => runTask(() => goTo(btn.dataset.view)));
});

navMobile.forEach(btn => {
  btn.addEventListener('click', () => runTask(() => goTo(btn.dataset.view)));
});

$('menuToggle').addEventListener('click', () => {
  $('mobileNav').classList.toggle('open');
});

/* ================================================================
   VISTA: TOMAR ASISTENCIA
   ================================================================ */
$('sel-modulo').addEventListener('change', () => {
  runTask(() => poblarSelectCurso('sel-curso', $('sel-modulo').value));
});

$('btn-cargar-lista').addEventListener('click', () => {
  runTask(cargarListaAsistencia);
});

$('btn-guardar').addEventListener('click', () => {
  runTask(guardarAsistencia);
});

$('btn-guardar-2').addEventListener('click', () => {
  runTask(guardarAsistencia);
});

$('btn-all-present').addEventListener('click', () => {
  $('attendance-body').querySelectorAll('tr').forEach(tr => {
    const radio = tr.querySelector('input[type="radio"][value="P"]');
    if (radio) radio.checked = true;
    setRowColor(tr, 'P');
  });

  updateStats();
  showToast('Todos marcados como presentes');
});

async function poblarSelectCurso(selectId, modulo, incluyeTodos = false) {
  const select = $(selectId);
  select.innerHTML = '';

  if (incluyeTodos) {
    select.appendChild(crearOption('', 'Todos'));
  } else {
    select.appendChild(
      crearOption('', modulo ? 'Seleccionar' : 'Primero selecciona modulo')
    );
  }

  if (!modulo) return;

  const cursos = await DB.getCursosByModulo(modulo);
  cursos.forEach(curso => {
    select.appendChild(
      crearOption(curso.id, `${curso.nombre}${curso.materia ? ' - ' + curso.materia : ''}`)
    );
  });
}

async function cargarListaAsistencia() {
  const modulo = $('sel-modulo').value;
  const cursoId = $('sel-curso').value;
  const fecha = $('sel-fecha').value;

  if (!modulo) return showToast('Selecciona un modulo', 'error');
  if (!cursoId) return showToast('Selecciona un curso', 'error');
  if (!fecha) return showToast('Selecciona la fecha', 'error');

  const curso = await DB.getCursoById(cursoId);
  if (!curso) return showToast('Curso no encontrado', 'error');
  if (!curso.estudiantes.length) {
    return showToast('Este curso no tiene estudiantes. Agrega estudiantes en Gestion de Cursos.', 'error');
  }

  activeCursoId = cursoId;
  activeFecha = fecha;
  activeModulo = modulo;

  $('panel-titulo').textContent = `Modulo ${modulo} - ${nombreCurso(curso)}`;
  $('panel-fecha').textContent = `Fecha: ${formatFecha(fecha)}`;

  const existente = await DB.getAsistenciaExistente(cursoId, fecha);
  renderTablaAsistencia(curso, existente);

  $('attendance-panel').style.display = 'block';
  $('empty-state-tomar').style.display = 'none';
  updateStats();

  if (existente) {
    showToast('Ya habia asistencia guardada para este dia. Puedes editarla.', 'default');
  }
}

function renderTablaAsistencia(curso, existente) {
  const tbody = $('attendance-body');
  tbody.innerHTML = '';

  curso.estudiantes.forEach((stu, index) => {
    const regExistente = existente
      ? existente.registros.find(r => r.stuId === stu.id)
      : null;

    const estadoActual = regExistente ? regExistente.estado : 'P';
    const obsActual = regExistente ? regExistente.obs || '' : '';

    const tr = document.createElement('tr');
    tr.dataset.stuId = stu.id;
    tr.innerHTML = `
      <td class="td-num">${index + 1}</td>
      <td class="td-name">${escapeHTML(stu.apellido)}, ${escapeHTML(stu.nombre)}</td>
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
      <td><input type="text" class="obs-input" placeholder="Observacion..." value="${escapeHTML(obsActual)}" data-stu="${stu.id}"></td>
    `;

    setRowColor(tr, estadoActual);

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

async function getRegistros() {
  const curso = await DB.getCursoById(activeCursoId);
  if (!curso) return [];

  const registros = [];
  $('attendance-body').querySelectorAll('tr').forEach(tr => {
    const stuId = tr.dataset.stuId;
    const stu = curso.estudiantes.find(estudiante => estudiante.id === stuId);
    const estado = tr.querySelector('.att-radio:checked')?.value || 'P';
    const obs = tr.querySelector('.obs-input')?.value || '';

    registros.push({
      stuId,
      apellido: stu?.apellido || '',
      nombre: stu?.nombre || '',
      estado,
      obs
    });
  });

  return registros;
}

function updateStats() {
  const rows = [...$('attendance-body').querySelectorAll('tr')];
  const estados = rows.map(tr => tr.querySelector('.att-radio:checked')?.value || 'P');

  $('stat-present').textContent = `Presentes: ${estados.filter(estado => estado === 'P').length}`;
  $('stat-absent').textContent = `Ausentes: ${estados.filter(estado => estado === 'A').length}`;
  $('stat-late').textContent = `Tardanzas: ${estados.filter(estado => estado === 'T').length}`;
}

async function guardarAsistencia() {
  if (!activeCursoId) return;

  const result = await DB.guardarAsistencia({
    cursoId: activeCursoId,
    modulo: activeModulo,
    fecha: activeFecha,
    registros: await getRegistros()
  });

  if (!result.ok) {
    showToast(result.msg || 'Error al guardar', 'error');
    return;
  }

  showToast('Asistencia guardada correctamente', 'success');
}

/* ================================================================
   VISTA: GESTION DE CURSOS
   ================================================================ */
$('btn-crear-curso').addEventListener('click', () => {
  runTask(crearCursoDesdeFormulario);
});

$('btn-agregar-stu').addEventListener('click', () => {
  runTask(agregarEstudianteDesdeFormulario);
});

['stu-apellido', 'stu-nombre'].forEach(id => {
  $(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') runTask(agregarEstudianteDesdeFormulario);
  });
});

$('btn-import-txt').addEventListener('click', () => {
  if (!cursoEditandoId) {
    showToast('Selecciona un curso primero', 'error');
    return;
  }

  $('import-modal').style.display = 'block';
  $('import-textarea').focus();
});

$('btn-import-cancel').addEventListener('click', cerrarImportacion);

$('btn-import-confirm').addEventListener('click', () => {
  runTask(importarEstudiantesDesdeTexto);
});

async function crearCursoDesdeFormulario() {
  const modulo = $('cur-modulo').value;
  const anio = $('cur-anio').value;
  const division = $('cur-division').value;
  const materia = $('cur-materia').value.trim();

  const result = await DB.crearCurso({ modulo, anio, division, materia });
  if (!result.ok) return showToast(result.msg, 'error');

  $('cur-materia').value = '';
  await renderCursosList();
  await abrirPanelEstudiantes(result.curso.id);
  showToast(`Curso ${anio}${division} creado en Modulo ${modulo}`, 'success');
}

async function agregarEstudianteDesdeFormulario() {
  const apellido = $('stu-apellido').value.trim();
  const nombre = $('stu-nombre').value.trim();

  if (!apellido || !nombre) return showToast('Completa apellido y nombre', 'error');
  if (!cursoEditandoId) return showToast('Selecciona un curso primero', 'error');

  const result = await DB.agregarEstudiante(cursoEditandoId, { apellido, nombre });
  if (!result.ok) return showToast(result.msg, 'error');

  $('stu-apellido').value = '';
  $('stu-nombre').value = '';
  $('stu-apellido').focus();

  const curso = await DB.getCursoById(cursoEditandoId);
  renderEstudiantesList(curso);
  await renderCursosList();
  showToast(`${apellido}, ${nombre} agregado/a`, 'success');
}

async function importarEstudiantesDesdeTexto() {
  const text = $('import-textarea').value.trim();
  if (!text) return showToast('La lista esta vacia', 'error');
  if (!cursoEditandoId) return showToast('Selecciona un curso primero', 'error');

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  let count = 0;

  for (const line of lines) {
    let apellido = '';
    let nombre = '';

    if (line.includes(',')) {
      [apellido, nombre] = line.split(',').map(part => part.trim());
    } else {
      const parts = line.split(/\s+/);
      apellido = parts[0] || '';
      nombre = parts.slice(1).join(' ') || '';
    }

    if (!apellido || !nombre) continue;

    const result = await DB.agregarEstudiante(cursoEditandoId, { apellido, nombre });
    if (!result.ok && result.msg.includes('almacenamiento')) {
      return showToast(result.msg, 'error');
    }

    if (result.ok) count++;
  }

  cerrarImportacion();
  const curso = await DB.getCursoById(cursoEditandoId);
  renderEstudiantesList(curso);
  await renderCursosList();
  showToast(`${count} estudiante(s) importado(s)`, 'success');
}

function cerrarImportacion() {
  $('import-modal').style.display = 'none';
  $('import-textarea').value = '';
}

async function renderCursosList() {
  const container = $('cursos-list');
  const cursos = (await DB.getCursos())
    .sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre));

  if (!cursos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px;padding:8px 0">Aun no hay cursos creados.</p>';
    return;
  }

  container.innerHTML = '';
  const porModulo = {};

  cursos.forEach(curso => {
    if (!porModulo[curso.modulo]) porModulo[curso.modulo] = [];
    porModulo[curso.modulo].push(curso);
  });

  Object.entries(porModulo).forEach(([modulo, lista]) => {
    const label = document.createElement('p');
    label.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin:14px 0 6px';
    label.textContent = `Modulo ${modulo}`;
    container.appendChild(label);

    lista.forEach(curso => {
      const div = document.createElement('div');
      div.className = 'curso-item';
      div.innerHTML = `
        <div class="curso-badge">M${curso.modulo}</div>
        <div class="curso-info">
          <div class="curso-name">${escapeHTML(curso.nombre)}${curso.materia ? ' - ' + escapeHTML(curso.materia) : ''}</div>
          <div class="curso-meta">${curso.estudiantes.length} estudiante${curso.estudiantes.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="curso-actions">
          <button class="btn-add-stu" data-id="${curso.id}">Estudiantes</button>
          <button class="btn-danger" data-del="${curso.id}" title="Eliminar curso">X</button>
        </div>
      `;
      container.appendChild(div);
    });
  });

  container.querySelectorAll('.btn-add-stu').forEach(btn => {
    btn.addEventListener('click', () => runTask(() => abrirPanelEstudiantes(btn.dataset.id)));
  });

  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => runTask(() => confirmarEliminarCurso(btn.dataset.del)));
  });
}

async function confirmarEliminarCurso(id) {
  const curso = await DB.getCursoById(id);
  if (!curso) return;
  if (!confirm(`Eliminar el curso ${curso.nombre}? Esto eliminara todas sus asistencias guardadas.`)) return;

  const result = await DB.eliminarCurso(id);
  if (!result.ok) return showToast(result.msg, 'error');

  if (cursoEditandoId === id) {
    cursoEditandoId = null;
    $('card-estudiantes').style.display = 'none';
  }

  await renderCursosList();
  showToast('Curso eliminado');
}

async function abrirPanelEstudiantes(cursoId) {
  cursoEditandoId = cursoId;
  const curso = await DB.getCursoById(cursoId);
  if (!curso) return;

  $('cur-selected-name').textContent = `${nombreCurso(curso)} (Modulo ${curso.modulo})`;
  $('card-estudiantes').style.display = 'block';
  $('card-estudiantes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderEstudiantesList(curso);
}

function renderEstudiantesList(curso) {
  const container = $('stu-list-container');

  if (!curso || !curso.estudiantes.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">Sin estudiantes. Agrega el primero.</p>';
    return;
  }

  container.innerHTML = '';

  curso.estudiantes.forEach((stu, index) => {
    const div = document.createElement('div');
    div.className = 'stu-item';
    div.innerHTML = `
      <span class="stu-num">${index + 1}</span>
      <span class="stu-name">${escapeHTML(stu.apellido)}, ${escapeHTML(stu.nombre)}</span>
      <button class="btn-danger" data-del="${stu.id}" title="Eliminar">X</button>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      runTask(async () => {
        if (!confirm('Eliminar este estudiante?')) return;

        const result = await DB.eliminarEstudiante(cursoEditandoId, btn.dataset.del);
        if (!result.ok) return showToast(result.msg, 'error');

        const cursoActualizado = await DB.getCursoById(cursoEditandoId);
        renderEstudiantesList(cursoActualizado);
        await renderCursosList();
        showToast('Estudiante eliminado');
      });
    });
  });
}

/* ================================================================
   VISTA: HISTORIAL
   ================================================================ */
$('his-modulo').addEventListener('change', () => {
  runTask(async () => {
    const modulo = $('his-modulo').value;
    if (modulo) await poblarSelectCurso('his-curso', modulo, true);
    else await poblarAllCursos('his-curso');
  });
});

$('btn-filtrar-his').addEventListener('click', () => {
  runTask(filtrarHistorial);
});

async function initHistorialView() {
  if ($('his-modulo').value) await poblarSelectCurso('his-curso', $('his-modulo').value, true);
  else await poblarAllCursos('his-curso');
}

async function poblarAllCursos(selectId) {
  const select = $(selectId);
  select.innerHTML = '';
  select.appendChild(crearOption('', 'Todos'));

  const cursos = (await DB.getCursos())
    .sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre));

  cursos.forEach(curso => {
    select.appendChild(
      crearOption(curso.id, `M${curso.modulo} - ${curso.nombre}${curso.materia ? ' - ' + curso.materia : ''}`)
    );
  });
}

async function filtrarHistorial() {
  const filtros = {
    modulo: $('his-modulo').value,
    cursoId: $('his-curso').value,
    desde: $('his-desde').value,
    hasta: $('his-hasta').value
  };

  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    showToast('La fecha Desde no puede ser mayor que Hasta', 'error');
    return;
  }

  const asistencias = await DB.getAsistenciasByFilter(filtros);
  await hydrateHistorialWithCourseNames(asistencias);
  renderHistorial(asistencias);
}

function renderHistorial(asistencias) {
  const container = $('historial-resultados');
  if (!asistencias.length) {
    renderMensajeVacio(container, '📅', 'No se encontraron registros con los filtros aplicados.');
    return;
  }

  container.innerHTML = '';

  asistencias.forEach(asistencia => {
    const div = document.createElement('div');
    div.className = 'his-entry';
    div.innerHTML = `
      <div class="his-header">
        <div>
          <div class="his-title">Modulo ${asistencia.modulo} - ${escapeHTML(asistencia.cursoNombre || asistencia.cursoId)}</div>
          <div class="his-date">${formatFecha(asistencia.fecha)}</div>
        </div>
        <div class="his-stats">
          <span class="his-stat p">P ${asistencia.registros.filter(r => r.estado === 'P').length}</span>
          <span class="his-stat a">A ${asistencia.registros.filter(r => r.estado === 'A').length}</span>
          <span class="his-stat t">T ${asistencia.registros.filter(r => r.estado === 'T').length}</span>
        </div>
      </div>
      <div class="his-detail">${buildHistorialDetalle(asistencia)}</div>
      <div class="his-entry-actions">
        <button class="btn-danger" data-del-asis="${asistencia.id}">Eliminar registro</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-del-asis]').forEach(btn => {
    btn.addEventListener('click', () => {
      runTask(async () => {
        if (!confirm('Eliminar este registro de asistencia?')) return;

        const result = await DB.eliminarAsistencia(btn.dataset.delAsis);
        if (!result.ok) return showToast(result.msg, 'error');

        await filtrarHistorial();
        showToast('Registro eliminado');
      });
    });
  });
}

function buildHistorialDetalle(asistencia) {
  const ausentes = asistencia.registros.filter(r => r.estado === 'A');
  const tardes = asistencia.registros.filter(r => r.estado === 'T');

  if (!ausentes.length && !tardes.length) {
    return '<p style="font-size:13px;color:var(--text-muted)">Todos presentes</p>';
  }

  const partes = [];

  if (ausentes.length) {
    partes.push(`
      <p style="font-size:12px;font-weight:700;color:var(--absent-fg);margin-bottom:6px">Ausentes:</p>
      <div class="his-list">
        ${ausentes.map(r => `<span class="his-stu a">${escapeHTML(r.apellido)}, ${escapeHTML(r.nombre)}${r.obs ? ` (${escapeHTML(r.obs)})` : ''}</span>`).join('')}
      </div>
    `);
  }

  if (tardes.length) {
    partes.push(`
      <p style="font-size:12px;font-weight:700;color:var(--late-fg);margin:10px 0 6px">Tardanzas:</p>
      <div class="his-list">
        ${tardes.map(r => `<span class="his-stu t">${escapeHTML(r.apellido)}, ${escapeHTML(r.nombre)}${r.obs ? ` (${escapeHTML(r.obs)})` : ''}</span>`).join('')}
      </div>
    `);
  }

  return partes.join('');
}

/* ================================================================
   VISTA: EXPORTAR
   ================================================================ */
$('exp-modulo').addEventListener('change', () => {
  runTask(async () => {
    const modulo = $('exp-modulo').value;
    if (modulo) await poblarSelectCurso('exp-curso', modulo, true);
    else await poblarAllCursos('exp-curso');
  });
});

async function initExportarView() {
  if ($('exp-modulo').value) await poblarSelectCurso('exp-curso', $('exp-modulo').value, true);
  else await poblarAllCursos('exp-curso');

  await renderResumenGeneral();
}

async function renderResumenGeneral() {
  const cursos = await DB.getCursos();
  const total = (await DB.getAsistencias()).length;
  const container = $('resumen-general');

  if (!cursos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No hay datos cargados aun.</p>';
    return;
  }

  let html = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Total de registros de asistencia guardados: <strong>${total}</strong></p>
    <table class="resumen-table">
      <thead>
        <tr>
          <th>Modulo</th>
          <th>Curso</th>
          <th>Estudiantes</th>
          <th>Dias registrados</th>
        </tr>
      </thead>
      <tbody>
  `;

  cursos
    .sort((a, b) => a.modulo - b.modulo || a.nombre.localeCompare(b.nombre))
    .forEach(curso => {
      html += `
        <tr>
          <td>Modulo ${curso.modulo}</td>
          <td>${escapeHTML(curso.nombre)}${curso.materia ? ' - ' + escapeHTML(curso.materia) : ''}</td>
          <td>${curso.estudiantes.length}</td>
          <td data-curso-dias="${curso.id}">...</td>
        </tr>
      `;
    });

  html += '</tbody></table>';
  container.innerHTML = html;

  await Promise.all(cursos.map(async curso => {
    const dias = (await DB.getAsistenciasByFilter({ cursoId: curso.id })).length;
    const cell = container.querySelector(`[data-curso-dias="${curso.id}"]`);
    if (cell) cell.textContent = String(dias);
  }));
}

/* ================================================================
   PWA INSTALL PROMPT
   ================================================================ */
const PWA_HIDE_KEY = 'cem83_pwa_hide_until';
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;

  refreshInstallCard();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hideInstallCard(true);
});

window.addEventListener('focus', () => {
  refreshInstallCard();
});

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function canShowInstallCard() {
  if (isStandaloneMode()) return false;

  const hideUntil = parseInt(localStorage.getItem(PWA_HIDE_KEY) || '0', 10);
  return !hideUntil || Date.now() > hideUntil;
}

function getInstallCardState() {
  if (deferredPrompt) {
    return {
      title: 'Instalar CEM 83',
      text: 'Instala la aplicacion en este dispositivo para abrirla como una app, entrar mas rapido y trabajar sin internet.',
      hint: 'Disponible para celulares, tablets y PC compatibles.',
      actionLabel: 'Instalar App',
      mode: 'prompt'
    };
  }

  if (isIOSDevice()) {
    return {
      title: 'Instalar CEM 83',
      text: 'Instala la app desde Safari para usarla como aplicacion y abrirla directo desde tu pantalla.',
      hint: 'Abre Compartir y luego toca "Agregar a pantalla de inicio".',
      actionLabel: 'Instalar App',
      mode: 'ios-help'
    };
  }

  return null;
}

function hideInstallCard(persist = false) {
  const card = $('install-card');
  if (!card) return;

  if (persist) {
    localStorage.setItem(PWA_HIDE_KEY, String(Date.now() + COOLDOWN_MS));
  }

  card.hidden = true;
}

function refreshInstallCard() {
  const card = $('install-card');
  if (!card) return;

  if (!canShowInstallCard()) {
    card.hidden = true;
    return;
  }

  const state = getInstallCardState();
  if (!state) {
    card.hidden = true;
    return;
  }

  $('install-card-title').textContent = state.title;
  $('install-card-text').textContent = state.text;
  $('install-card-hint').textContent = state.hint;
  $('install-card-action').textContent = state.actionLabel;
  $('install-card-action').dataset.mode = state.mode;
  card.hidden = false;
}

async function onInstallCardAction() {
  const mode = $('install-card-action').dataset.mode;

  if (mode === 'prompt' && deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;

    if (outcome === 'accepted') {
      hideInstallCard(true);
      showToast('La instalacion fue iniciada en este dispositivo', 'success');
      return;
    }

    refreshInstallCard();
    return;
  }

  if (mode === 'ios-help') {
    showToast('En Safari: Compartir > Agregar a pantalla de inicio', 'default');
    return;
  }
}

/* ================================================================
   INIT
   ================================================================ */
async function hydrateHistorialWithCourseNames(asistencias) {
  const cache = new Map();

  await Promise.all(asistencias.map(async asistencia => {
    if (!cache.has(asistencia.cursoId)) {
      cache.set(asistencia.cursoId, await DB.getCursoById(asistencia.cursoId));
    }

    const curso = cache.get(asistencia.cursoId);
    asistencia.cursoNombre = curso ? nombreCurso(curso) : asistencia.cursoId;
  }));
}

async function initApp() {
  setLoadingState(true);
  $('sel-fecha').value = fechaHoy();

  try {
    await DB.ready();
    $('install-card-action').addEventListener('click', () => {
      runTask(onInstallCardAction);
    });
    $('install-card-close').addEventListener('click', () => {
      hideInstallCard(true);
    });
    refreshInstallCard();
    await goTo('tomar');
  } catch (error) {
    console.error(error);
    showToast('No se pudo inicializar la base de datos local', 'error');
  } finally {
    setLoadingState(false);
  }
}

runTask(initApp);
