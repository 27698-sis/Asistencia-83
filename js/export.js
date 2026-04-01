/**
 * export.js — CEM N°83 Asistencia
 * Exportación CSV e impresión
 */

/* ================================================================
   CSV
   ================================================================ */
function descargarCSV(filas, nombreArchivo) {
  const bom = '\uFEFF'; // UTF-8 BOM para que Excel lo abra correctamente
  const csv = bom + filas.map(row =>
    row.map(celda => {
      const str = String(celda ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildFilename(prefijo, desde, hasta) {
  const parts = ['CEM83', prefijo];
  if (desde) parts.push(desde.replace(/-/g, ''));
  if (hasta && hasta !== desde) parts.push(hasta.replace(/-/g, ''));
  return parts.join('_') + '.csv';
}

/* ---- DETALLE POR DÍA ---- */
function exportarDetalle(asistencias) {
  const filas = [
    ['CEM N°83 — Informe de Asistencia Detallado'],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['Módulo', 'Curso', 'Materia', 'Fecha', 'Apellido', 'Nombre', 'Estado', 'Observación']
  ];

  asistencias.forEach(a => {
    const curso = DB.getCursoById(a.cursoId);
    a.registros.forEach(r => {
      filas.push([
        `Módulo ${a.modulo}`,
        curso ? curso.nombre : a.cursoId,
        curso ? curso.materia : '',
        formatFechaExport(a.fecha),
        r.apellido,
        r.nombre,
        r.estado === 'P' ? 'Presente' : r.estado === 'A' ? 'Ausente' : 'Tarde',
        r.obs || ''
      ]);
    });
  });
  return filas;
}

/* ---- RESUMEN POR ESTUDIANTE ---- */
function exportarResumen(asistencias) {
  // Agrupar por curso
  const porCurso = {};
  asistencias.forEach(a => {
    if (!porCurso[a.cursoId]) porCurso[a.cursoId] = [];
    porCurso[a.cursoId].push(a);
  });

  const filas = [
    ['CEM N°83 — Resumen de Asistencia por Estudiante'],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['Módulo', 'Curso', 'Materia', 'Apellido', 'Nombre', 'Presentes', 'Ausentes', 'Tardanzas', 'Total días', '% Asistencia']
  ];

  Object.entries(porCurso).forEach(([cursoId, asis]) => {
    const curso = DB.getCursoById(cursoId);
    if (!curso) return;
    const resumen = DB.getResumenEstudiante(cursoId);

    resumen.forEach(r => {
      const totalDias = asis.length;
      const pct = totalDias > 0 ? Math.round(((r.presentes + r.tardes) / totalDias) * 100) : 0;
      filas.push([
        `Módulo ${curso.modulo}`,
        curso.nombre,
        curso.materia || '',
        r.apellido,
        r.nombre,
        r.presentes,
        r.ausentes,
        r.tardes,
        totalDias,
        `${pct}%`
      ]);
    });
    filas.push([]); // separador entre cursos
  });

  return filas;
}

/* ---- PLANILLA MENSUAL ---- */
function exportarMensual(asistencias, cursoId) {
  const curso = DB.getCursoById(cursoId);
  if (!curso) return exportarResumen(asistencias);

  const fechas = [...new Set(asistencias.map(a => a.fecha))].sort();

  const filas = [
    [`CEM N°83 — Planilla Mensual: ${curso.nombre}${curso.materia ? ' — ' + curso.materia : ''} — Módulo ${curso.modulo}`],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['#', 'Apellido', 'Nombre', ...fechas.map(f => formatFechaExport(f)), 'Presentes', 'Ausentes', 'Tardanzas', '%']
  ];

  const asisMap = {};
  asistencias.forEach(a => { asisMap[a.fecha] = a; });

  curso.estudiantes.forEach((stu, i) => {
    let p = 0, a = 0, t = 0;
    const estados = fechas.map(fecha => {
      const reg = asisMap[fecha]?.registros.find(r => r.stuId === stu.id);
      const estado = reg ? reg.estado : '-';
      if (estado === 'P') p++;
      else if (estado === 'A') a++;
      else if (estado === 'T') t++;
      return estado;
    });
    const total = p + a + t;
    const pct   = total > 0 ? Math.round(((p + t) / total) * 100) : 0;
    filas.push([i + 1, stu.apellido, stu.nombre, ...estados, p, a, t, `${pct}%`]);
  });

  return filas;
}

function formatFechaExport(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

/* ================================================================
   PRINT
   ================================================================ */
function generarPrint(asistencias, tipo) {
  const printArea = document.getElementById('print-area');

  if (tipo === 'mensual') {
    const cursoId = document.getElementById('exp-curso').value;
    const curso = DB.getCursoById(cursoId);
    if (!curso) { showToast('Seleccioná un curso para planilla mensual', 'error'); return; }
    printArea.innerHTML = buildPrintMensual(asistencias, curso);
  } else if (tipo === 'resumen') {
    printArea.innerHTML = buildPrintResumen(asistencias);
  } else {
    printArea.innerHTML = buildPrintDetalle(asistencias);
  }

  setTimeout(() => window.print(), 100);
}

function buildPrintDetalle(asistencias) {
  let rows = '';
  asistencias.forEach(a => {
    const curso = DB.getCursoById(a.cursoId);
    a.registros.forEach(r => {
      const estadoLabel = r.estado === 'P' ? 'Presente' : r.estado === 'A' ? 'Ausente' : 'Tarde';
      rows += `<tr>
        <td>Módulo ${a.modulo}</td>
        <td>${curso ? curso.nombre : ''}</td>
        <td>${formatFechaExport(a.fecha)}</td>
        <td>${r.apellido}, ${r.nombre}</td>
        <td>${estadoLabel}</td>
        <td>${r.obs || ''}</td>
      </tr>`;
    });
  });

  return `
    <div class="print-header">
      <h1>CEM N°83 — Informe de Asistencia</h1>
      <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
    </div>
    <table class="print-table">
      <thead>
        <tr><th>Módulo</th><th>Curso</th><th>Fecha</th><th>Estudiante</th><th>Estado</th><th>Obs.</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildPrintResumen(asistencias) {
  const porCurso = {};
  asistencias.forEach(a => {
    if (!porCurso[a.cursoId]) porCurso[a.cursoId] = [];
    porCurso[a.cursoId].push(a);
  });

  let sections = '';
  Object.entries(porCurso).forEach(([cid, asis]) => {
    const curso = DB.getCursoById(cid);
    if (!curso) return;
    const resumen = DB.getResumenEstudiante(cid);
    const totalDias = asis.length;

    let rows = resumen.map(r => {
      const pct = totalDias > 0 ? Math.round(((r.presentes + r.tardes) / totalDias) * 100) : 0;
      return `<tr>
        <td>${r.apellido}, ${r.nombre}</td>
        <td style="text-align:center">${r.presentes}</td>
        <td style="text-align:center">${r.ausentes}</td>
        <td style="text-align:center">${r.tardes}</td>
        <td style="text-align:center">${pct}%</td>
      </tr>`;
    }).join('');

    sections += `
      <h2 style="margin:20px 0 8px;font-size:16px">
        Módulo ${curso.modulo} — ${curso.nombre}${curso.materia ? ' — ' + curso.materia : ''}
        <small style="font-weight:normal;font-size:12px"> (${totalDias} días registrados)</small>
      </h2>
      <table class="print-table">
        <thead><tr><th>Estudiante</th><th>Presentes</th><th>Ausentes</th><th>Tardanzas</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  });

  return `
    <div class="print-header">
      <h1>CEM N°83 — Resumen de Asistencia</h1>
      <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
    </div>
    ${sections}
  `;
}

function buildPrintMensual(asistencias, curso) {
  const fechas  = [...new Set(asistencias.map(a => a.fecha))].sort();
  const asisMap = {};
  asistencias.forEach(a => { asisMap[a.fecha] = a; });

  const headerCols = fechas.map(f => `<th style="text-align:center;font-size:10px">${formatFechaExport(f)}</th>`).join('');

  let rows = '';
  curso.estudiantes.forEach((stu, i) => {
    const celdas = fechas.map(fecha => {
      const reg = asisMap[fecha]?.registros.find(r => r.stuId === stu.id);
      const e = reg ? reg.estado : '-';
      const color = e === 'P' ? '' : e === 'A' ? 'background:#fee2e2' : e === 'T' ? 'background:#fef9c3' : '';
      return `<td style="text-align:center;${color}">${e}</td>`;
    });
    rows += `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${stu.apellido}, ${stu.nombre}</td>
      ${celdas.join('')}
    </tr>`;
  });

  return `
    <div class="print-header">
      <h1>CEM N°83 — Planilla de Asistencia</h1>
      <p>Módulo ${curso.modulo} — ${curso.nombre}${curso.materia ? ' — ' + curso.materia : ''}</p>
      <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Estudiante</th>
          ${headerCols}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:12px;font-size:11px">P = Presente &nbsp;&nbsp; A = Ausente &nbsp;&nbsp; T = Tarde</p>
  `;
}

/* ================================================================
   EVENTOS BOTONES
   ================================================================ */
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const modulo  = document.getElementById('exp-modulo').value;
  const cursoId = document.getElementById('exp-curso').value;
  const desde   = document.getElementById('exp-desde').value;
  const hasta   = document.getElementById('exp-hasta').value;
  const tipo    = document.getElementById('exp-tipo').value;

  const asistencias = DB.getAsistenciasByFilter({ modulo, cursoId, desde, hasta });
  if (!asistencias.length) return showToast('No hay datos para exportar con esos filtros', 'error');

  let filas;
  if (tipo === 'resumen')  filas = exportarResumen(asistencias);
  else if (tipo === 'mensual') filas = exportarMensual(asistencias, cursoId);
  else filas = exportarDetalle(asistencias);

  descargarCSV(filas, buildFilename(tipo, desde, hasta));
  showToast('✅ CSV descargado correctamente', 'success');
});

document.getElementById('btn-export-print').addEventListener('click', () => {
  const modulo  = document.getElementById('exp-modulo').value;
  const cursoId = document.getElementById('exp-curso').value;
  const desde   = document.getElementById('exp-desde').value;
  const hasta   = document.getElementById('exp-hasta').value;
  const tipo    = document.getElementById('exp-tipo').value;

  const asistencias = DB.getAsistenciasByFilter({ modulo, cursoId, desde, hasta });
  if (!asistencias.length) return showToast('No hay datos para imprimir con esos filtros', 'error');

  generarPrint(asistencias, tipo);
});
