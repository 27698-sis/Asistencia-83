/**
 * export.js - CEM N°83 Asistencia
 * Exportacion CSV e impresion
 */

/* ================================================================
   CSV
   ================================================================ */
function descargarCSV(filas, nombreArchivo) {
  const bom = '\uFEFF';
  const csv = bom + filas.map(row =>
    row.map(celda => {
      const str = String(celda ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
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
  return `${parts.join('_')}.csv`;
}

function formatFechaExport(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function withCourseName(curso) {
  return `${curso.nombre}${curso.materia ? ' - ' + curso.materia : ''}`;
}

function validarFiltrosExportacion({ tipo, cursoId, desde, hasta }, curso) {
  if (desde && hasta && desde > hasta) {
    showToast('La fecha Desde no puede ser mayor que Hasta', 'error');
    return false;
  }

  if (tipo === 'mensual' && !curso) {
    showToast('Selecciona un curso para la planilla mensual', 'error');
    return false;
  }

  return true;
}

/* ================================================================
   BUILDERS CSV
   ================================================================ */
async function exportarDetalle(asistencias) {
  const filas = [
    ['CEM N°83 - Informe de Asistencia Detallado'],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['Modulo', 'Curso', 'Materia', 'Fecha', 'Apellido', 'Nombre', 'Estado', 'Observacion']
  ];

  for (const asistencia of asistencias) {
    const curso = await DB.getCursoById(asistencia.cursoId);
    asistencia.registros.forEach(registro => {
      filas.push([
        `Modulo ${asistencia.modulo}`,
        curso ? curso.nombre : asistencia.cursoId,
        curso ? curso.materia : '',
        formatFechaExport(asistencia.fecha),
        registro.apellido,
        registro.nombre,
        registro.estado === 'P' ? 'Presente' : registro.estado === 'A' ? 'Ausente' : 'Tarde',
        registro.obs || ''
      ]);
    });
  }

  return filas;
}

async function exportarResumen(asistencias) {
  const porCurso = {};
  asistencias.forEach(asistencia => {
    if (!porCurso[asistencia.cursoId]) porCurso[asistencia.cursoId] = [];
    porCurso[asistencia.cursoId].push(asistencia);
  });

  const filas = [
    ['CEM N°83 - Resumen de Asistencia por Estudiante'],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['Modulo', 'Curso', 'Materia', 'Apellido', 'Nombre', 'Presentes', 'Ausentes', 'Tardanzas', 'Total dias', '% Asistencia']
  ];

  for (const cursoId of Object.keys(porCurso)) {
    const curso = await DB.getCursoById(cursoId);
    if (!curso) continue;

    const resumen = await DB.getResumenEstudiante(cursoId);
    resumen.forEach(item => {
      filas.push([
        `Modulo ${curso.modulo}`,
        curso.nombre,
        curso.materia || '',
        item.apellido,
        item.nombre,
        item.presentes,
        item.ausentes,
        item.tardes,
        item.totalDias,
        item.pct !== null ? `${item.pct}%` : '0%'
      ]);
    });

    filas.push([]);
  }

  return filas;
}

async function exportarMensual(asistencias, curso) {
  const fechas = [...new Set(asistencias.map(asistencia => asistencia.fecha))].sort();
  const resumen = await DB.getResumenEstudiante(curso.id);
  const asisMap = {};
  asistencias.forEach(asistencia => {
    asisMap[asistencia.fecha] = asistencia;
  });

  const filas = [
    [`CEM N°83 - Planilla Mensual: ${withCourseName(curso)} - Modulo ${curso.modulo}`],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [],
    ['#', 'Apellido', 'Nombre', ...fechas.map(formatFechaExport), 'Presentes', 'Ausentes', 'Tardanzas', '%']
  ];

  curso.estudiantes.forEach((stu, index) => {
    const infoStu = resumen.find(r => r.id === stu.id) || {
      presentes: 0,
      ausentes: 0,
      tardes: 0,
      pct: 0
    };

    const estados = fechas.map(fecha => {
      const reg = asisMap[fecha]?.registros.find(r => r.stuId === stu.id);
      return reg ? reg.estado : '-';
    });

    filas.push([
      index + 1,
      stu.apellido,
      stu.nombre,
      ...estados,
      infoStu.presentes,
      infoStu.ausentes,
      infoStu.tardes,
      infoStu.pct !== null ? `${infoStu.pct}%` : '0%'
    ]);
  });

  return filas;
}

/* ================================================================
   PRINT
   ================================================================ */
async function generarPrint(asistencias, tipo, curso) {
  const printArea = document.getElementById('print-area');

  if (tipo === 'mensual') {
    printArea.innerHTML = buildPrintMensual(asistencias, curso);
  } else if (tipo === 'resumen') {
    printArea.innerHTML = await buildPrintResumen(asistencias);
  } else {
    printArea.innerHTML = await buildPrintDetalle(asistencias);
  }

  setTimeout(() => window.print(), 100);
}

async function buildPrintDetalle(asistencias) {
  let rows = '';

  for (const asistencia of asistencias) {
    const curso = await DB.getCursoById(asistencia.cursoId);
    asistencia.registros.forEach(registro => {
      const estadoLabel = registro.estado === 'P'
        ? 'Presente'
        : registro.estado === 'A'
          ? 'Ausente'
          : 'Tarde';

      rows += `
        <tr>
          <td>Modulo ${asistencia.modulo}</td>
          <td>${curso ? escapeHTML(curso.nombre) : ''}</td>
          <td>${formatFechaExport(asistencia.fecha)}</td>
          <td>${escapeHTML(registro.apellido)}, ${escapeHTML(registro.nombre)}</td>
          <td>${estadoLabel}</td>
          <td>${escapeHTML(registro.obs || '')}</td>
        </tr>
      `;
    });
  }

  return `
    <div class="print-header">
      <h1>CEM N°83 - Informe de Asistencia</h1>
      <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
    </div>
    <table class="print-table">
      <thead>
        <tr><th>Modulo</th><th>Curso</th><th>Fecha</th><th>Estudiante</th><th>Estado</th><th>Obs.</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function buildPrintResumen(asistencias) {
  const porCurso = {};
  asistencias.forEach(asistencia => {
    if (!porCurso[asistencia.cursoId]) porCurso[asistencia.cursoId] = [];
    porCurso[asistencia.cursoId].push(asistencia);
  });

  let sections = '';

  for (const cursoId of Object.keys(porCurso)) {
    const curso = await DB.getCursoById(cursoId);
    if (!curso) continue;

    const resumen = await DB.getResumenEstudiante(cursoId);
    const totalDias = resumen.length ? resumen[0].totalDias : 0;
    const rows = resumen.map(item => `
      <tr>
        <td>${escapeHTML(item.apellido)}, ${escapeHTML(item.nombre)}</td>
        <td style="text-align:center">${item.presentes}</td>
        <td style="text-align:center">${item.ausentes}</td>
        <td style="text-align:center">${item.tardes}</td>
        <td style="text-align:center">${item.pct !== null ? `${item.pct}%` : '0%'}</td>
      </tr>
    `).join('');

    sections += `
      <h2 style="margin:20px 0 8px;font-size:16px">
        Modulo ${curso.modulo} - ${escapeHTML(withCourseName(curso))}
        <small style="font-weight:normal;font-size:12px"> (${totalDias} dias registrados)</small>
      </h2>
      <table class="print-table">
        <thead><tr><th>Estudiante</th><th>Presentes</th><th>Ausentes</th><th>Tardanzas</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `
    <div class="print-header">
      <h1>CEM N°83 - Resumen de Asistencia</h1>
      <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
    </div>
    ${sections}
  `;
}

function buildPrintMensual(asistencias, curso) {
  const fechas = [...new Set(asistencias.map(asistencia => asistencia.fecha))].sort();
  const asisMap = {};
  asistencias.forEach(asistencia => {
    asisMap[asistencia.fecha] = asistencia;
  });

  const headerCols = fechas
    .map(fecha => `<th style="text-align:center;font-size:10px">${formatFechaExport(fecha)}</th>`)
    .join('');

  let rows = '';
  curso.estudiantes.forEach((stu, index) => {
    const celdas = fechas.map(fecha => {
      const reg = asisMap[fecha]?.registros.find(r => r.stuId === stu.id);
      const estado = reg ? reg.estado : '-';
      const color = estado === 'A'
        ? 'background:#fee2e2'
        : estado === 'T'
          ? 'background:#fef9c3'
          : '';

      return `<td style="text-align:center;${color}">${estado}</td>`;
    });

    rows += `
      <tr>
        <td style="text-align:center">${index + 1}</td>
        <td>${escapeHTML(stu.apellido)}, ${escapeHTML(stu.nombre)}</td>
        ${celdas.join('')}
      </tr>
    `;
  });

  return `
    <div class="print-header">
      <h1>CEM N°83 - Planilla de Asistencia</h1>
      <p>Modulo ${curso.modulo} - ${escapeHTML(withCourseName(curso))}</p>
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
    <p style="margin-top:12px;font-size:11px">P = Presente | A = Ausente | T = Tarde</p>
  `;
}

/* ================================================================
   EVENTOS BOTONES
   ================================================================ */
document.getElementById('btn-export-csv').addEventListener('click', () => {
  runTask(async () => {
    const filtros = {
      modulo: document.getElementById('exp-modulo').value,
      cursoId: document.getElementById('exp-curso').value,
      desde: document.getElementById('exp-desde').value,
      hasta: document.getElementById('exp-hasta').value
    };
    const tipo = document.getElementById('exp-tipo').value;
    const curso = filtros.cursoId ? await DB.getCursoById(filtros.cursoId) : null;

    if (!validarFiltrosExportacion({ ...filtros, tipo }, curso)) return;

    const asistencias = await DB.getAsistenciasByFilter(filtros);
    if (!asistencias.length) {
      showToast('No hay datos para exportar con esos filtros', 'error');
      return;
    }

    const filas = tipo === 'resumen'
      ? await exportarResumen(asistencias)
      : tipo === 'mensual'
        ? await exportarMensual(asistencias, curso)
        : await exportarDetalle(asistencias);

    descargarCSV(filas, buildFilename(tipo, filtros.desde, filtros.hasta));
    showToast('CSV descargado correctamente', 'success');
  });
});

document.getElementById('btn-export-print').addEventListener('click', () => {
  runTask(async () => {
    const filtros = {
      modulo: document.getElementById('exp-modulo').value,
      cursoId: document.getElementById('exp-curso').value,
      desde: document.getElementById('exp-desde').value,
      hasta: document.getElementById('exp-hasta').value
    };
    const tipo = document.getElementById('exp-tipo').value;
    const curso = filtros.cursoId ? await DB.getCursoById(filtros.cursoId) : null;

    if (!validarFiltrosExportacion({ ...filtros, tipo }, curso)) return;

    const asistencias = await DB.getAsistenciasByFilter(filtros);
    if (!asistencias.length) {
      showToast('No hay datos para imprimir con esos filtros', 'error');
      return;
    }

    await generarPrint(asistencias, tipo, curso);
  });
});
