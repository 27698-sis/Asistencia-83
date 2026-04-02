/**
 * db.js - CEM N°83 Asistencia
 * Capa de datos usando IndexedDB con migracion desde localStorage
 */

const DB = (() => {
  const DB_NAME = 'cem83_asistencia';
  const DB_VERSION = 1;
  const STORE_CURSOS = 'cursos';
  const STORE_ASISTENCIAS = 'asistencias';
  const STORE_META = 'meta';

  const LEGACY_KEY_CURSOS = 'cem83_cursos';
  const LEGACY_KEY_ASISTENCIAS = 'cem83_asistencias';
  const META_MIGRATION_KEY = 'legacyMigrated';
  const STORAGE_ERROR_MSG = 'No se pudieron guardar los datos. Verifica el almacenamiento del navegador.';

  const requestToPromise = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error en IndexedDB'));
  });

  const transactionDone = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Transaccion abortada'));
    tx.onerror = () => reject(tx.error || new Error('Error de transaccion'));
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function createStores(db) {
    if (!db.objectStoreNames.contains(STORE_CURSOS)) {
      db.createObjectStore(STORE_CURSOS, { keyPath: 'id' });
    }

    if (!db.objectStoreNames.contains(STORE_ASISTENCIAS)) {
      const store = db.createObjectStore(STORE_ASISTENCIAS, { keyPath: 'id' });
      store.createIndex('byCursoFecha', 'cursoFecha', { unique: true });
    }

    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META, { keyPath: 'key' });
    }
  }

  function normalizeCurso(raw) {
    return {
      id: raw.id || uid(),
      modulo: Number(raw.modulo),
      anio: raw.anio || '',
      division: raw.division || '',
      nombre: raw.nombre || `${raw.anio || ''}${raw.division || ''}`,
      materia: raw.materia || '',
      estudiantes: Array.isArray(raw.estudiantes) ? raw.estudiantes.map(stu => ({
        id: stu.id || uid(),
        apellido: stu.apellido || '',
        nombre: stu.nombre || ''
      })) : [],
      creadoEn: raw.creadoEn || new Date().toISOString()
    };
  }

  function normalizeAsistencia(raw) {
    const cursoId = raw.cursoId || '';
    const fecha = raw.fecha || '';

    return {
      id: raw.id || uid(),
      cursoId,
      modulo: Number(raw.modulo),
      fecha,
      cursoFecha: `${cursoId}::${fecha}`,
      docenteNota: raw.docenteNota || '',
      registros: Array.isArray(raw.registros) ? raw.registros.map(reg => ({
        stuId: reg.stuId || uid(),
        apellido: reg.apellido || '',
        nombre: reg.nombre || '',
        estado: reg.estado || 'P',
        obs: reg.obs || ''
      })) : [],
      guardadoEn: raw.guardadoEn || new Date().toISOString()
    };
  }

  function parseLegacyArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  const dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no esta disponible en este navegador'));
      return;
    }

    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

    openRequest.onupgradeneeded = event => {
      createStores(event.target.result);
    };

    openRequest.onsuccess = async () => {
      const db = openRequest.result;
      db.onversionchange = () => db.close();

      try {
        await migrateLegacyDataIfNeeded(db);
        resolve(db);
      } catch (error) {
        reject(error);
      }
    };

    openRequest.onerror = () => {
      reject(openRequest.error || new Error('No se pudo abrir la base de datos'));
    };
  });

  async function migrateLegacyDataIfNeeded(db) {
    const tx = db.transaction([STORE_META, STORE_CURSOS, STORE_ASISTENCIAS], 'readwrite');
    const metaStore = tx.objectStore(STORE_META);
    const cursosStore = tx.objectStore(STORE_CURSOS);
    const asistenciasStore = tx.objectStore(STORE_ASISTENCIAS);

    const migrationMeta = await requestToPromise(metaStore.get(META_MIGRATION_KEY));
    if (migrationMeta?.value) {
      await transactionDone(tx);
      return;
    }

    const cursosCount = await requestToPromise(cursosStore.count());
    const asistenciasCount = await requestToPromise(asistenciasStore.count());

    if (cursosCount === 0 && asistenciasCount === 0) {
      parseLegacyArray(LEGACY_KEY_CURSOS)
        .map(normalizeCurso)
        .forEach(curso => cursosStore.put(curso));

      parseLegacyArray(LEGACY_KEY_ASISTENCIAS)
        .map(normalizeAsistencia)
        .forEach(asistencia => asistenciasStore.put(asistencia));
    }

    metaStore.put({
      key: META_MIGRATION_KEY,
      value: true,
      migratedAt: new Date().toISOString()
    });

    await transactionDone(tx);
  }

  async function getDb() {
    return dbPromise;
  }

  async function getAllFromStore(storeName) {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readonly');
    const data = await requestToPromise(tx.objectStore(storeName).getAll());
    await transactionDone(tx);
    return data;
  }

  async function putInStore(storeName, value) {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    await transactionDone(tx);
  }

  async function deleteFromStore(storeName, key) {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    await transactionDone(tx);
  }

  async function clearAndImport(data) {
    const db = await getDb();
    const tx = db.transaction([STORE_CURSOS, STORE_ASISTENCIAS], 'readwrite');
    const cursosStore = tx.objectStore(STORE_CURSOS);
    const asistenciasStore = tx.objectStore(STORE_ASISTENCIAS);

    cursosStore.clear();
    asistenciasStore.clear();

    (Array.isArray(data.cursos) ? data.cursos : [])
      .map(normalizeCurso)
      .forEach(curso => cursosStore.put(curso));

    (Array.isArray(data.asistencias) ? data.asistencias : [])
      .map(normalizeAsistencia)
      .forEach(asistencia => asistenciasStore.put(asistencia));

    await transactionDone(tx);
  }

  /* ================================================================
     CURSOS
     ================================================================ */
  const getCursos = async () => {
    try {
      return await getAllFromStore(STORE_CURSOS);
    } catch (error) {
      console.error('Error leyendo cursos:', error);
      return [];
    }
  };

  const getCursosByModulo = async modulo => {
    const cursos = await getCursos();
    return cursos.filter(curso => String(curso.modulo) === String(modulo));
  };

  const getCursoById = async id => {
    try {
      const db = await getDb();
      const tx = db.transaction(STORE_CURSOS, 'readonly');
      const curso = await requestToPromise(tx.objectStore(STORE_CURSOS).get(id));
      await transactionDone(tx);
      return curso || null;
    } catch (error) {
      console.error('Error leyendo curso:', error);
      return null;
    }
  };

  const crearCurso = async ({ modulo, anio, division, materia }) => {
    try {
      const cursos = await getCursos();
      const existe = cursos.find(curso =>
        String(curso.modulo) === String(modulo) &&
        curso.anio === anio &&
        curso.division === division
      );

      if (existe) return { ok: false, msg: 'Ya existe ese curso en ese modulo.' };

      const nuevo = normalizeCurso({
        id: uid(),
        modulo,
        anio,
        division,
        nombre: `${anio}${division}`,
        materia,
        estudiantes: [],
        creadoEn: new Date().toISOString()
      });

      await putInStore(STORE_CURSOS, nuevo);
      return { ok: true, curso: nuevo };
    } catch (error) {
      console.error('Error creando curso:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  const eliminarCurso = async id => {
    try {
      const db = await getDb();
      const tx = db.transaction([STORE_CURSOS, STORE_ASISTENCIAS], 'readwrite');
      tx.objectStore(STORE_CURSOS).delete(id);

      const asistenciasStore = tx.objectStore(STORE_ASISTENCIAS);
      const asistencias = await requestToPromise(asistenciasStore.getAll());
      asistencias
        .filter(asistencia => asistencia.cursoId === id)
        .forEach(asistencia => asistenciasStore.delete(asistencia.id));

      await transactionDone(tx);
      return { ok: true };
    } catch (error) {
      console.error('Error eliminando curso:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  const agregarEstudiante = async (cursoId, { nombre, apellido }) => {
    try {
      const curso = await getCursoById(cursoId);
      if (!curso) return { ok: false, msg: 'Curso no encontrado' };

      const existe = curso.estudiantes.find(estudiante =>
        estudiante.apellido.toLowerCase() === apellido.toLowerCase() &&
        estudiante.nombre.toLowerCase() === nombre.toLowerCase()
      );

      if (existe) return { ok: false, msg: 'El estudiante ya esta en la lista.' };

      const stu = {
        id: uid(),
        apellido: apellido.trim(),
        nombre: nombre.trim()
      };

      curso.estudiantes.push(stu);
      curso.estudiantes.sort((a, b) =>
        a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es')
      );

      await putInStore(STORE_CURSOS, normalizeCurso(curso));
      return { ok: true, stu };
    } catch (error) {
      console.error('Error agregando estudiante:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  const eliminarEstudiante = async (cursoId, stuId) => {
    try {
      const curso = await getCursoById(cursoId);
      if (!curso) return { ok: false, msg: 'Curso no encontrado' };

      curso.estudiantes = curso.estudiantes.filter(estudiante => estudiante.id !== stuId);
      await putInStore(STORE_CURSOS, normalizeCurso(curso));
      return { ok: true };
    } catch (error) {
      console.error('Error eliminando estudiante:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  /* ================================================================
     ASISTENCIAS
     ================================================================ */
  const getAsistencias = async () => {
    try {
      return await getAllFromStore(STORE_ASISTENCIAS);
    } catch (error) {
      console.error('Error leyendo asistencias:', error);
      return [];
    }
  };

  const getAsistenciasByFilter = async ({ modulo, cursoId, desde, hasta }) => {
    const asistencias = await getAsistencias();
    let filtered = asistencias;

    if (modulo) filtered = filtered.filter(asistencia => String(asistencia.modulo) === String(modulo));
    if (cursoId) filtered = filtered.filter(asistencia => asistencia.cursoId === cursoId);
    if (desde) filtered = filtered.filter(asistencia => asistencia.fecha >= desde);
    if (hasta) filtered = filtered.filter(asistencia => asistencia.fecha <= hasta);

    return filtered.sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const getAsistenciaExistente = async (cursoId, fecha) => {
    try {
      const db = await getDb();
      const tx = db.transaction(STORE_ASISTENCIAS, 'readonly');
      const index = tx.objectStore(STORE_ASISTENCIAS).index('byCursoFecha');
      const asistencia = await requestToPromise(index.get(`${cursoId}::${fecha}`));
      await transactionDone(tx);
      return asistencia || null;
    } catch (error) {
      console.error('Error leyendo asistencia existente:', error);
      return null;
    }
  };

  const guardarAsistencia = async ({ cursoId, modulo, fecha, registros, docenteNota }) => {
    try {
      const existente = await getAsistenciaExistente(cursoId, fecha);
      const entry = normalizeAsistencia({
        id: existente?.id || uid(),
        cursoId,
        modulo,
        fecha,
        docenteNota: docenteNota || '',
        registros,
        guardadoEn: new Date().toISOString()
      });

      await putInStore(STORE_ASISTENCIAS, entry);
      return { ok: true, entry };
    } catch (error) {
      console.error('Error guardando asistencia:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  const eliminarAsistencia = async id => {
    try {
      await deleteFromStore(STORE_ASISTENCIAS, id);
      return { ok: true };
    } catch (error) {
      console.error('Error eliminando asistencia:', error);
      return { ok: false, msg: STORAGE_ERROR_MSG };
    }
  };

  /* ================================================================
     RESUMEN POR ESTUDIANTE
     ================================================================ */
  const getResumenEstudiante = async cursoId => {
    const curso = await getCursoById(cursoId);
    if (!curso) return [];

    const asistencias = (await getAsistencias()).filter(asistencia => asistencia.cursoId === cursoId);
    const totalDias = asistencias.length;

    return curso.estudiantes.map(stu => {
      let presentes = 0;
      let ausentes = 0;
      let tardes = 0;

      asistencias.forEach(asistencia => {
        const reg = asistencia.registros.find(item => item.stuId === stu.id);
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
  const exportAll = async () => ({
    cursos: await getCursos(),
    asistencias: await getAsistencias(),
    exportadoEn: new Date().toISOString()
  });

  const importAll = async json => {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || typeof data !== 'object') return false;
      await clearAndImport(data);
      return true;
    } catch (error) {
      console.error('Error importando datos:', error);
      return false;
    }
  };

  return {
    ready: () => dbPromise,
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
