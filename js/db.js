/**
 * db.js — CEM N°83 Asistencia
 * Capa de datos usando localStorage
 */

const DB = (() => {

  const KEY_CURSOS      = 'cem83_cursos';
  const KEY_ASISTENCIAS = 'cem83_asistencias';

  /* ---- helpers ---- */
  const load = key => {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  };

  const save = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ================================================================
     CURSOS
     ================================================================ */
  const getCursos = () => load(KEY_CURSOS);

  const getCursosByModulo = (modulo) =>
    getCursos().filter(c => String(c.modulo) === String(modulo));

  const getCursoById = (id) =>
    getCursos().find(c => c.id === id) || null;

  const crearCurso = ({ modulo, anio, division, materia }) => {
    const cursos = getCursos();
    const nombre = `${anio}${division}`;
    const existe = cursos.find(c =>
      String(c.modulo) === String(modulo) &&
      c.anio === anio &&
      c.division === division
    );
    if (existe) return { ok: false, msg: 'Ya existe ese curso en ese módulo.' };

    const nuevo = {
      id: uid(),
      modulo: Number(modulo),
      anio,
      division,
      nombre,
      materia: materia || '',
      estudiantes: [],
      creadoEn: new Date().toISOString()
    };
    cursos.push(nuevo);
    save(KEY_CURSOS, cursos);
    return { ok: true, curso: nuevo };
  };

  const eliminarCurso = (id) => {
    let cursos = getCursos();
    cursos = cursos.filter(c => c.id !== id);
    save(KEY_CURSOS, cursos);
    // también eliminar sus asistencias
    let asis = load(KEY_ASISTENCIAS);
    asis = asis.filter(a => a.cursoId !== id);
    save(KEY_ASISTENCIAS, asis);
  };

  const agregarEstudiante = (cursoId, { nombre, apellido }) => {
    const cursos = getCursos();
    const idx = cursos.findIndex(c => c.id === cursoId);
    if (idx < 0) return { ok: false, msg: 'Curso no encontrado' };

    const curso = cursos[idx];
    const existe = curso.estudiantes.find(
      e => e.apellido.toLowerCase() === apellido.toLowerCase() &&
           e.nombre.toLowerCase() === nombre.toLowerCase()
    );
    if (existe) return { ok: false, msg: 'El estudiante ya está en la lista.' };

    const stu = { id: uid(), apellido: apellido.trim(), nombre: nombre.trim() };
    curso.estudiantes.push(stu);
    // ordenar por apellido
    curso.estudiantes.sort((a, b) =>
      a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es')
    );
    cursos[idx] = curso;
    save(KEY_CURSOS, cursos);
    return { ok: true, stu };
  };

  const eliminarEstudiante = (cursoId, stuId) => {
    const cursos = getCursos();
    const idx = cursos.findIndex(c => c.id === cursoId);
    if (idx < 0) return;
    cursos[idx].estudiantes = cursos[idx].estudiantes.filter(e => e.id !== stuId);
    save(KEY_CURSOS, cursos);
  };

  /* ================================================================
     ASISTENCIAS
     ================================================================ */
  const getAsistencias = () => load(KEY_ASISTENCIAS);

  const getAsistenciasByFilter = ({ modulo, cursoId, desde, hasta }) => {
    let all = getAsistencias();
    if (modulo)  all = all.filter(a => String(a.modulo) === String(modulo));
    if (cursoId) all = all.filter(a => a.cursoId === cursoId);
    if (desde)   all = all.filter(a => a.fecha >= desde);
    if (hasta)   all = all.filter(a => a.fecha <= hasta);
    return all.sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const getAsistenciaExistente = (cursoId, fecha) =>
    getAsistencias().find(a => a.cursoId === cursoId && a.fecha === fecha) || null;

  const guardarAsistencia = ({ cursoId, modulo, fecha, registros, docenteNota }) => {
    const all = getAsistencias();
    const idx = all.findIndex(a => a.cursoId === cursoId && a.fecha === fecha);
    const entry = {
      id: idx >= 0 ? all[idx].id : uid(),
      cursoId,
      modulo: Number(modulo),
      fecha,
      docenteNota: docenteNota || '',
      registros, // [{ stuId, apellido, nombre, estado: 'P'|'A'|'T', obs }]
      guardadoEn: new Date().toISOString()
    };
    if (idx >= 0) { all[idx] = entry; }
    else { all.push(entry); }
    save(KEY_ASISTENCIAS, all);
    return { ok: true, entry };
  };

  const eliminarAsistencia = (id) => {
    const all = getAsistencias().filter(a => a.id !== id);
    save(KEY_ASISTENCIAS, all);
  };

  /* ================================================================
     RESUMEN POR ESTUDIANTE
     ================================================================ */
  const getResumenEstudiante = (cursoId) => {
    const curso = getCursoById(cursoId);
    if (!curso) return [];
    const asis = getAsistencias().filter(a => a.cursoId === cursoId);
    const totalDias = asis.length;

    return curso.estudiantes.map(stu => {
      let presentes = 0, ausentes = 0, tardes = 0;
      asis.forEach(a => {
        const reg = a.registros.find(r => r.stuId === stu.id);
        if (!reg) return;
        if (reg.estado === 'P') presentes++;
        else if (reg.estado === 'A') ausentes++;
        else if (reg.estado === 'T') tardes++;
      });
      const pct = totalDias > 0
        ? Math.round(((presentes + tardes) / totalDias) * 100)
        : null;
      return { ...stu, presentes, ausentes, tardes, totalDias, pct };
    });
  };

  /* ================================================================
     EXPORT DATA
     ================================================================ */
  const exportAll = () => ({
    cursos: getCursos(),
    asistencias: getAsistencias(),
    exportadoEn: new Date().toISOString()
  });

  const importAll = (json) => {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (data && typeof data === 'object') {
        if (Array.isArray(data.cursos)) save(KEY_CURSOS, data.cursos);
        if (Array.isArray(data.asistencias)) save(KEY_ASISTENCIAS, data.asistencias);
        return true;
      }
      return false;
    } catch (e) { console.error("Error importando datos:", e); return false; }
  };

  /* ================================================================
     PUBLIC API
     ================================================================ */
  return {
    getCursos,
    getCursosByModulo,
    getCursoById,
    crearCurso,
    eliminarCurso,
    agregarEstudiante,
    eliminarEstudiante,
    getAsistencias,
    getAsistenciasByFilter,
    getAsistenciaExistente,
    guardarAsistencia,
    eliminarAsistencia,
    getResumenEstudiante,
    exportAll,
    importAll
  };
})();
