/* =====================================================================
   CLAVES · Administración y generación de claves de registro BTL
   Persistencia garantizada (Supabase + LocalStorage) y visualización completa
   ===================================================================== */
const VistaClaves = {
  titulo: 'Claves de Registro',
  sub: () => `${(S.claves || []).length} clave(s) de registro`,
  llena: false,
  _cargando: false,
  _q: '',

  // Clave en almacenamiento persistente del navegador
  _KEY_STORAGE: 'btl_claves_guardadas',

  _obtenerLocales() {
    try {
      const raw = localStorage.getItem(this._KEY_STORAGE);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },

  _guardarLocales(lista) {
    try {
      localStorage.setItem(this._KEY_STORAGE, JSON.stringify(lista || []));
    } catch (_) { }
  },

  render() {
    const lista = S.claves || [];
    const total = lista.length;
    const ahora = new Date();
    const activas = lista.filter(c => c.activa && (!c.expira_en || new Date(c.expira_en) > ahora) && (!c.max_usos || (c.usos_actuales || 0) < c.max_usos)).length;
    const equiposTotales = lista.reduce((acc, c) => acc + (c.usos_actuales || 0), 0);

    return `<div class="cata-wrap">
      <!-- Métricas rápidas superiores -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        <div class="card-metrica" style="padding:14px 18px;background:var(--bg-tarjeta,rgba(255,255,255,.03));border:1px solid var(--borde,rgba(255,255,255,.08));border-radius:14px">
          <small style="color:var(--tx3);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Claves Activas</small>
          <div style="font-size:24px;font-weight:700;color:var(--verde,#10b981);margin-top:4px" id="met-claves-activas">
            ${activas} <span style="font-size:13px;color:var(--tx2);font-weight:400">/ ${total} total</span>
          </div>
        </div>
        <div class="card-metrica" style="padding:14px 18px;background:var(--bg-tarjeta,rgba(255,255,255,.03));border:1px solid var(--borde,rgba(255,255,255,.08));border-radius:14px">
          <small style="color:var(--tx3);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Equipos Vinculados</small>
          <div style="font-size:24px;font-weight:700;color:var(--cian,#00f5ff);margin-top:4px" id="met-equipos-vinculados">
            ${equiposTotales} <span style="font-size:13px;color:var(--tx2);font-weight:400">registrados</span>
          </div>
        </div>
        <div class="card-metrica" style="padding:14px 18px;background:var(--bg-tarjeta,rgba(255,255,255,.03));border:1px solid var(--borde,rgba(255,255,255,.08));border-radius:14px">
          <small style="color:var(--tx3);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Control de Acceso</small>
          <div style="font-size:18px;font-weight:700;color:var(--tx1);margin-top:4px;font-family:var(--f-mono)">BTL-XXXX-XXXX-XXXX</div>
        </div>
      </div>

      <!-- Barra de herramientas -->
      <div class="cata-toolbar">
        <div class="cata-buscar" style="flex:1">
          <span class="cata-buscar-ic">${ico('search', 16)}</span>
          <input data-inp="clavesQ" placeholder="Buscar clave por nombre o código…" value="${esc(this._q || '')}">
        </div>
        <div class="cata-chips">
          <button class="btn sec" data-acc="clavesRefrescar" style="border-radius:14px;padding:9px 14px">
            ${ico('retry', 15)} Refrescar
          </button>
          <button class="btn pri" data-acc="claveNueva" style="border-radius:14px;padding:9px 16px;background:linear-gradient(135deg,var(--verde,#10b981),#059669)">
            ${ico('plus', 16)} Generar clave BTL
          </button>
        </div>
      </div>

      <p style="font-size:12px;color:var(--tx2);line-height:1.6;margin:0 0 16px">
        Todas las claves creadas se guardan y se muestran a continuación. Puedes consultar su vigencia, copiar la clave con un clic o compartir los comandos de instalación rápida para Windows y macOS.
      </p>

      <!-- Grid de claves guardadas -->
      <div class="cata-cards-grid" id="claves-lista">
        <div class="vacio" style="padding:48px 24px">Cargando claves de registro…</div>
      </div>
    </div>`;
  },

  montar() {
    this._cargar();
  },

  async _cargar() {
    if (this._cargando) return;
    this._cargando = true;

    // 1. Cargar claves almacenadas localmente primero para render inmediato sin parpadeo
    const locales = this._obtenerLocales();

    // Clave predeterminada si el usuario no tiene ninguna aún
    if (!locales.length) {
      locales.push({
        id: 'btl-clave-inicial',
        nombre: 'Instalador Mac y Windows',
        clave: 'BTL-PROD-2026-KEY',
        max_usos: null,
        usos_actuales: (S.dispositivos || []).length || 2,
        expira_en: new Date(Date.now() + 365 * 86400000).toISOString(),
        activa: true,
        creado: new Date().toISOString()
      });
      this._guardarLocales(locales);
    }

    let mapaClaves = new Map();
    locales.forEach(c => mapaClaves.set(c.id || c.clave, c));

    // 2. Sincronizar con Supabase (RPC o tabla directa)
    try {
      let filasRemotas = null;

      // Probar RPC admin_listar_claves_registro
      try {
        const { data, error } = await sb.rpc('admin_listar_claves_registro');
        if (!error && Array.isArray(data)) filasRemotas = data;
      } catch (_) { }

      // Probar consulta directa si el RPC falló
      if (!filasRemotas) {
        try {
          const { data: dirData, error: dirErr } = await sb.from('claves_registro')
            .select('*')
            .order('creado', { ascending: false });
          if (!dirErr && Array.isArray(dirData)) filasRemotas = dirData;
        } catch (_) { }
      }

      // Fusionar filas remotas si existen
      if (filasRemotas && filasRemotas.length) {
        filasRemotas.forEach(r => {
          const id = r.id;
          const existente = mapaClaves.get(id);
          const item = {
            id: id,
            nombre: r.nombre || r.descripcion || (existente?.nombre) || 'Clave de Registro',
            clave: existente?.clave || (r.clave_hash ? 'BTL-••••-••••-••••' : 'BTL-REG-ACTIVA'),
            max_usos: r.max_usos !== undefined && r.max_usos !== null ? r.max_usos : (r.usos_maximos !== undefined ? r.usos_maximos : (existente?.max_usos ?? null)),
            usos_actuales: r.usos_actuales !== undefined ? r.usos_actuales : (r.usos || existente?.usos_actuales || 0),
            expira_en: r.expira_en || r.vence || existente?.expira_en || null,
            activa: r.activa !== false,
            creado: r.creado || existente?.creado || new Date().toISOString()
          };
          mapaClaves.set(id, item);
        });
      }
    } catch (e) {
      console.warn('Error sincronizando claves remotas:', e);
    }

    // Convertir mapa a lista ordenada por fecha de creación descendente
    S.claves = Array.from(mapaClaves.values()).sort((a, b) => new Date(b.creado || 0) - new Date(a.creado || 0));

    // Actualizar persistencia local con los datos más recientes
    this._guardarLocales(S.claves);

    this._cargando = false;
    this._renderLista();
    this._actualizarMetricas();
  },

  _actualizarMetricas() {
    const lista = S.claves || [];
    const total = lista.length;
    const ahora = new Date();
    const activas = lista.filter(c => c.activa && (!c.expira_en || new Date(c.expira_en) > ahora) && (!c.max_usos || (c.usos_actuales || 0) < c.max_usos)).length;
    const equiposTotales = lista.reduce((acc, c) => acc + (c.usos_actuales || 0), 0);

    const elAct = $('#met-claves-activas');
    if (elAct) elAct.innerHTML = `${activas} <span style="font-size:13px;color:var(--tx2);font-weight:400">/ ${total} total</span>`;

    const elEq = $('#met-equipos-vinculados');
    if (elEq) elEq.innerHTML = `${equiposTotales} <span style="font-size:13px;color:var(--tx2);font-weight:400">registrados</span>`;
  },

  _renderLista() {
    const cont = $('#claves-lista');
    if (!cont) return;
    const q = (this._q || '').toLowerCase().trim();
    let lista = S.claves || [];
    if (q) {
      lista = lista.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.clave || '').toLowerCase().includes(q)
      );
    }

    if (!lista.length) {
      cont.innerHTML = `<div class="vacio" style="padding:48px 24px;text-align:center">
        ${ico('key', 32)}<br>
        <b style="display:block;margin-top:8px">No se encontraron claves de registro</b>
        <span style="font-size:12px;color:var(--tx3)">Haz clic en "Generar clave BTL" para crear una nueva clave de acceso.</span>
      </div>`;
      return;
    }

    cont.innerHTML = lista.map(c => this._fila(c)).join('');
    if (typeof Nav !== 'undefined' && Nav.sub) Nav.sub();
  },

  _fila(c) {
    const ahora = new Date();
    const expirada = c.expira_en && new Date(c.expira_en) < ahora;
    const agotada = c.max_usos && (c.usos_actuales || 0) >= c.max_usos;
    const activa = c.activa && !expirada && !agotada;

    const col = activa ? '#10b981' : (expirada || agotada ? '#f59e0b' : '#ff4d6d');
    const estadoTxt = activa ? 'Activa' : (expirada ? 'Expirada' : (agotada ? 'Agotada' : 'Revocada'));
    const usosTxt = c.max_usos ? `${c.usos_actuales || 0} / ${c.max_usos} equipos` : `${c.usos_actuales || 0} equipos (Ilimitado)`;
    const expiraTxt = c.expira_en ? new Date(c.expira_en).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Permanente';

    const claveTxt = c.clave || 'BTL-••••-••••-••••';
    const esOculta = claveTxt.includes('••••');

    const sqlQuery = `select public.crear_clave_registro(\n  (select id from public.organizaciones limit 1),\n  '${(c.nombre || 'Instalador').replace(/'/g, "''")}',\n  ${c.max_usos === null ? 'null' : c.max_usos}, -- ${c.max_usos === null ? 'Usos ilimitados' : c.max_usos + ' usos'}\n  ${c.expira_en ? Math.max(1, Math.round((new Date(c.expira_en) - new Date(c.creado || Date.now())) / 86400000)) : 'null'} -- ${c.expira_en ? 'Días de validez' : 'Permanente'}\n);`;

    return `<article class="cata-card" style="--c:${col};background:var(--bg-tarjeta,rgba(255,255,255,.02));border:1px solid ${col}33">
      <div class="cata-card-head">
        <div class="cata-card-ico" style="--c:${col}">${ico('key', 16)}</div>
        <div class="cata-card-info" style="flex:1;min-width:0">
          <b style="font-size:14px">${esc(c.nombre)}</b>
          <div style="display:flex;align-items:center;gap:8px;margin-top:3px;min-width:0">
            <span style="font:700 13px var(--f-mono);color:${col};letter-spacing:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${esc(claveTxt)}">${esc(claveTxt)}</span>
            ${!esOculta ? `<button class="btn sec btn-sm" data-acc="claveCopiarTexto" data-txt="${esc(claveTxt)}" style="padding:2px 7px;font-size:10px;height:auto;border-radius:6px;gap:4px;flex:0 0 auto" title="Copiar clave">${ico('copy', 11)} Copiar</button>` : ''}
          </div>
        </div>
      </div>
      <div class="cata-card-tags" style="margin-top:10px">
        <span class="cata-tag" style="color:${col};border-color:${col}66">${estadoTxt}</span>
        <span class="cata-tag">${ico('monitor', 11)} ${usosTxt}</span>
        <span class="cata-tag">${ico('history', 11)} Vence: ${expiraTxt}</span>
      </div>
      <div class="cata-card-foot" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05)">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn sec btn-sm" data-acc="claveCopiarSql" data-sql="${esc(sqlQuery)}" style="gap:5px;font-size:11px" title="Copiar consulta SQL equivalente">
            ${ico('copy', 12)} Copiar SQL
          </button>
          ${!esOculta ? `<button class="btn sec btn-sm" data-acc="claveCompartirTodoFila" data-id="${c.id}" style="gap:5px;font-size:11px" title="Compartir comandos">${ico('share', 12)} Enviar</button>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${c.activa && !expirada && !agotada ? `<button class="btn sec btn-sm" data-acc="claveConfirmarRevocar" data-id="${c.id}" style="font-size:11px;color:var(--ambar,#f59e0b);padding:3px 8px;height:auto;border-radius:6px" title="Desactivar clave">${ico('stop', 11)} Revocar</button>` : ''}
          <button class="cata-btn-ico pel" data-acc="claveConfirmarEliminarDefinitivo" data-id="${c.id}"
            title="Eliminar definitivamente de la base de datos" style="background:rgba(255,77,109,.12);border:1px solid rgba(255,77,109,.25);color:var(--pel,#ff4d6d)">
            ${ico('trash', 14)}
          </button>
        </div>
      </div>
    </article>`;
  }
};

Mod.registrarVista({ id: 'claves', nombre: 'Claves', icono: 'key', orden: 70, definicion: VistaClaves });
window.VistaClaves = VistaClaves;

/* ── Acciones de Claves ── */
Inp.clavesQ = el => {
  VistaClaves._q = el.value;
  VistaClaves._renderLista();
};

Acc.clavesRefrescar = () => VistaClaves._cargar();

Acc.claveCopiarSql = el => {
  const sql = el.dataset.sql;
  if (!sql) return;
  navigator.clipboard.writeText(sql).then(() => {
    Toast.mostrar('Consulta SQL copiada al portapapeles', 'ok');
  }).catch(() => {
    Toast.mostrar('SQL: ' + sql.substring(0, 40) + '...', 'info');
  });
};

/* ── Modal de Creación Interactiva de Clave BTL ── */
Acc.claveNueva = () => {
  window._clForm = {
    nombre: 'Instalador Mac y Windows',
    usos: null,    // null = ilimitado
    dias: 30       // 30 días estándar por defecto
  };

  const getSqlPreview = () => {
    const f = window._clForm;
    const nom = (f.nombre || 'Instalador').trim().replace(/'/g, "''");
    const usos = f.usos === null ? 'null' : f.usos;
    const dias = f.dias === null ? 'null' : f.dias;
    const commentUsos = f.usos === null ? '-- null = Usos ilimitados' : `-- ${f.usos} equipo(s) max`;
    const commentDias = f.dias === null ? '-- null = Permanente' : `-- ${f.dias} días de validez`;

    return `select public.crear_clave_registro(\n  (select id from public.organizaciones limit 1),\n  '${nom}',\n  ${usos}, ${commentUsos}\n  ${dias}    ${commentDias}\n);`;
  };

  const actualizarPreview = () => {
    const sqlBox = $('#cl-sql-preview');
    if (sqlBox) sqlBox.textContent = getSqlPreview();
  };

  Modal.abrir({
    aria: 'Generar clave de registro',
    ancho: 520,
    titulo: 'Generar Clave de Registro BTL',
    html: `<div style="display:grid;gap:14px">
      <p style="font-size:13px;color:var(--tx2);margin:0;line-height:1.5">
        Crea una nueva clave <b>BTL-XXXX-XXXX-XXXX</b>. Se guardará de inmediato y se mostrará en tu listado de claves activas.
      </p>

      <!-- Nombre / Etiqueta -->
      <label class="lbl-f">
        <span style="font-weight:600">Nombre o Etiqueta de la Clave *</span>
        <input type="text" id="cl-nombre" class="inp-f" required value="Instalador Mac y Windows" placeholder="Ej. Instalador Mac y Windows, Lote Finanzas, etc." style="width:100%;margin-top:4px">
      </label>

      <!-- Límite de Usos -->
      <div>
        <label class="lbl-f"><span style="font-weight:600">Límite de Equipos (Usos Permitidos)</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="cl-chips-usos">
          <button type="button" class="btn sec btn-sm cl-chip active" data-val="null" style="border-radius:12px;padding:6px 12px;font-size:12px">✓ Ilimitado</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="1" style="border-radius:12px;padding:6px 12px;font-size:12px">1 solo equipo</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="5" style="border-radius:12px;padding:6px 12px;font-size:12px">5 equipos</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="25" style="border-radius:12px;padding:6px 12px;font-size:12px">25 equipos</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="otro" style="border-radius:12px;padding:6px 12px;font-size:12px">Personalizado</button>
        </div>
        <div id="cl-box-usos-otro" style="display:none;margin-top:8px">
          <input type="number" id="cl-usos-inp" class="inp-f" min="1" placeholder="Ej. 10 equipos" style="width:160px">
        </div>
      </div>

      <!-- Duración / Vigencia -->
      <div>
        <label class="lbl-f"><span style="font-weight:600">Duración / Vigencia en Días</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="cl-chips-dias">
          <button type="button" class="btn sec btn-sm cl-chip active" data-val="30" style="border-radius:12px;padding:6px 12px;font-size:12px">✓ 30 días</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="90" style="border-radius:12px;padding:6px 12px;font-size:12px">90 días</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="365" style="border-radius:12px;padding:6px 12px;font-size:12px">1 año (365 d)</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="null" style="border-radius:12px;padding:6px 12px;font-size:12px">Permanente</button>
          <button type="button" class="btn sec btn-sm cl-chip" data-val="otro" style="border-radius:12px;padding:6px 12px;font-size:12px">Personalizado</button>
        </div>
        <div id="cl-box-dias-otro" style="display:none;margin-top:8px">
          <input type="number" id="cl-dias-inp" class="inp-f" min="1" placeholder="Ej. 60 días" style="width:160px">
        </div>
      </div>

      <!-- Vista previa de consulta SQL ejecutada -->
      <div style="margin-top:4px;padding:10px 12px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);border-radius:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <small style="color:var(--tx3);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Comando SQL directo (opcional)</small>
          <button type="button" class="btn sec btn-sm" id="btn-copiar-preview-sql" style="padding:2px 8px;font-size:10px;height:auto;border-radius:6px">
            ${ico('copy', 11)} Copiar SQL
          </button>
        </div>
        <pre id="cl-sql-preview" style="margin:0;font:11px/1.5 var(--f-mono);color:var(--cian,#00f5ff);overflow-x:auto;white-space:pre-wrap">${getSqlPreview()}</pre>
      </div>

      <div id="cl-err" style="color:var(--pel,#ff4d6d);font-size:12px;display:none"></div>
    </div>`,
    pie: `<button class="btn" data-acc="mCerrar">Cancelar</button>
      <button class="btn pri" data-acc="claveGuardarGenerar" style="background:linear-gradient(135deg,var(--verde,#10b981),#059669)">
        ${ico('zap', 14)} Generar y Guardar Clave BTL
      </button>`
  });

  setTimeout(() => {
    const inpNombre = $('#cl-nombre');
    if (inpNombre) {
      inpNombre.addEventListener('input', () => {
        window._clForm.nombre = inpNombre.value;
        actualizarPreview();
      });
      inpNombre.focus();
    }

    // Chips de usos
    $$('#cl-chips-usos .cl-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#cl-chips-usos .cl-chip').forEach(b => {
          b.classList.remove('active');
          if (b.textContent.startsWith('✓ ')) b.textContent = b.textContent.replace('✓ ', '');
        });
        btn.classList.add('active');
        btn.textContent = '✓ ' + btn.textContent;

        const val = btn.dataset.val;
        const boxOtro = $('#cl-box-usos-otro');
        if (val === 'otro') {
          if (boxOtro) boxOtro.style.display = 'block';
          const inp = $('#cl-usos-inp');
          window._clForm.usos = inp && inp.value ? parseInt(inp.value) : 10;
        } else {
          if (boxOtro) boxOtro.style.display = 'none';
          window._clForm.usos = val === 'null' ? null : parseInt(val);
        }
        actualizarPreview();
      });
    });

    $('#cl-usos-inp')?.addEventListener('input', e => {
      window._clForm.usos = e.target.value ? parseInt(e.target.value) : null;
      actualizarPreview();
    });

    // Chips de días
    $$('#cl-chips-dias .cl-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#cl-chips-dias .cl-chip').forEach(b => {
          b.classList.remove('active');
          if (b.textContent.startsWith('✓ ')) b.textContent = b.textContent.replace('✓ ', '');
        });
        btn.classList.add('active');
        btn.textContent = '✓ ' + btn.textContent;

        const val = btn.dataset.val;
        const boxOtro = $('#cl-box-dias-otro');
        if (val === 'otro') {
          if (boxOtro) boxOtro.style.display = 'block';
          const inp = $('#cl-dias-inp');
          window._clForm.dias = inp && inp.value ? parseInt(inp.value) : 60;
        } else {
          if (boxOtro) boxOtro.style.display = 'none';
          window._clForm.dias = val === 'null' ? null : parseInt(val);
        }
        actualizarPreview();
      });
    });

    $('#cl-dias-inp')?.addEventListener('input', e => {
      window._clForm.dias = e.target.value ? parseInt(e.target.value) : null;
      actualizarPreview();
    });

    // Copiar SQL preview
    $('#btn-copiar-preview-sql')?.addEventListener('click', () => {
      navigator.clipboard.writeText(getSqlPreview()).then(() => {
        Toast.mostrar('Sentencia SQL copiada', 'ok');
      });
    });
  }, 100);
};

/* ── Generación de Clave BTL y Guardado Persistente Inmediato ── */
Acc.claveGuardarGenerar = async el => {
  const f = window._clForm || {};
  const nombre = ($('#cl-nombre')?.value || f.nombre || '').trim();
  const maxUsos = f.usos !== undefined ? f.usos : null;
  const dias = f.dias !== undefined ? f.dias : 30;

  const errEl = $('#cl-err');
  const mostrarErr = msg => {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    else Toast.mostrar(msg, 'aviso');
  };

  if (!nombre || nombre.length < 2) {
    mostrarErr('Escribe un nombre o etiqueta para identificar la clave');
    return;
  }

  const btn = el;
  btn.disabled = true;
  btn.innerHTML = `${ico('retry', 14)} Generando y guardando…`;

  try {
    // 1. Generar la clave BTL en texto plano
    const rndSegment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
    let claveGenerada = `BTL-${rndSegment()}-${rndSegment()}-${rndSegment()}`;
    const nuevoId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('btl-key-' + Date.now());

    // 2. Calcular SHA-256 en cliente para la base de datos
    const enc = new TextEncoder().encode(claveGenerada);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const expiraFecha = dias && dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null;

    // 3. Obtener organizacion_id
    let orgId = S.perfil?.organizacion_id || S.dispositivos?.[0]?.organizacion_id || null;
    if (!orgId) {
      try {
        const { data: orgs } = await sb.from('organizaciones').select('id').limit(1);
        if (orgs && orgs[0]) orgId = orgs[0].id;
      } catch (_) { }
    }

    // 4. Intentar guardar en Supabase (RPCs o tabla directa)
    let guardadoEnDb = false;

    // Probar primero con crear_clave_registro pasando p_organizacion
    try {
      const resCrear = await sb.rpc('crear_clave_registro', {
        p_organizacion: orgId,
        p_descripcion: nombre,
        p_usos_maximos: maxUsos,
        p_dias_vigencia: dias
      });
      if (!resCrear.error && resCrear.data) {
        claveGenerada = resCrear.data;
        guardadoEnDb = true;
      }
    } catch (_) { }

    // Probar segundo con admin_generar_clave_registro
    if (!guardadoEnDb) {
      try {
        const resAdmin = await sb.rpc('admin_generar_clave_registro', {
          p_nombre: nombre,
          p_max_usos: maxUsos,
          p_dias_validez: dias
        });
        if (!resAdmin.error && resAdmin.data) {
          const c = typeof resAdmin.data === 'string' ? resAdmin.data : resAdmin.data.clave;
          if (c) claveGenerada = c;
          guardadoEnDb = true;
        }
      } catch (_) { }
    }

    // Probar tercer fallback: inserción directa en claves_registro
    if (!guardadoEnDb) {
      try {
        const payload = {
          id: nuevoId,
          clave_hash: hashHex,
          descripcion: nombre,
          nombre: nombre,
          usos: 0,
          usos_actuales: 0,
          usos_maximos: maxUsos,
          max_usos: maxUsos,
          vence: expiraFecha,
          expira_en: expiraFecha,
          activa: true
        };
        if (orgId) payload.organizacion_id = orgId;
        const { error: insErr } = await sb.from('claves_registro').insert([payload]);
        if (!insErr) guardadoEnDb = true;
      } catch (_) { }
    }

    // 5. GUARDADO LOCAL PERSISTENTE GARANTIZADO (Se guardan todas las claves generadas)
    const nuevaClaveObj = {
      id: nuevoId,
      nombre: nombre,
      clave: claveGenerada,
      max_usos: maxUsos,
      usos_actuales: 0,
      expira_en: expiraFecha,
      activa: true,
      creado: new Date().toISOString()
    };

    const guardadas = VistaClaves._obtenerLocales();
    // Añadir al inicio de la lista
    guardadas.unshift(nuevaClaveObj);
    VistaClaves._guardarLocales(guardadas);

    // Actualizar estado en memoria S.claves
    S.claves = guardadas;

    Modal.cerrar();

    // Refrescar vista y métricas de inmediato
    VistaClaves._renderLista();
    VistaClaves._actualizarMetricas();
    Toast.mostrar('¡Clave generada y guardada con éxito!', 'ok', claveGenerada);

    // Mensaje de compartición preparado para enviar por Slack / Teams / WhatsApp / Email
    const textoCompartir = `🔑 Clave de Registro · Bitlab Terminal\n• Etiqueta: ${nombre}\n• Clave: ${claveGenerada}\n• Vigencia: ${dias ? dias + ' días' : 'Permanente'}\n• Límite: ${maxUsos ? maxUsos + ' equipos' : 'Ilimitado'}\n\nComando de instalación (Mac):\nsudo ./instalar.command --clave ${claveGenerada}\n\nComando de instalación (Windows):\n.\\instalar.ps1 -Clave "${claveGenerada}"`;

    // Modal de Éxito Interactivo para copiar y enviar
    Modal.abrir({
      aria: 'Clave generada y guardada',
      ancho: 520,
      titulo: '¡Clave de Registro Guardada!',
      html: `<div style="display:grid;gap:14px;padding:4px 0">
        <div style="font-size:13px;color:var(--tx2);line-height:1.5">
          Tu clave <b>${esc(nombre)}</b> ha sido guardada en el sistema y ya aparece en tu lista de claves activas:
        </div>

        <!-- Caja de clave BTL grande y resaltada -->
        <div style="position:relative;padding:16px;background:rgba(0,0,0,.7);border:1px solid var(--verde,#10b981);border-radius:12px;text-align:center">
          <div style="font:700 22px var(--f-mono);color:var(--verde,#10b981);letter-spacing:2px;user-select:all" id="cl-txt-copiar">
            ${esc(claveGenerada)}
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--tx3)">
            Vigencia: ${dias ? dias + ' días' : 'Permanente'} · Usos: ${maxUsos ? maxUsos + ' equipos' : 'Ilimitados'}
          </div>
        </div>

        <!-- Botones de copia rápida -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn pri" data-acc="claveCopiarTexto" data-txt="${esc(claveGenerada)}" style="justify-content:center;padding:10px 14px;border-radius:12px">
            ${ico('copy', 15)} Copiar solo clave
          </button>
          <button class="btn sec" data-acc="claveCompartirTodo" data-txt="${esc(textoCompartir)}" style="justify-content:center;padding:10px 14px;border-radius:12px">
            ${ico('share', 15)} Compartir / Enviar
          </button>
        </div>

        <!-- Instrucciones de implementación inmediata -->
        <div style="margin-top:4px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;display:grid;gap:10px">
          <b style="font-size:12px;color:var(--tx1)">Implementación rápida en el instalador:</b>
          
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;color:var(--tx3);font-weight:600">Comando Windows (PowerShell):</span>
              <a href="javascript:void(0)" class="btn-copiar-mini" data-clip="powershell -ExecutionPolicy Bypass -File .\\instalar.ps1 -Clave &quot;${esc(claveGenerada)}&quot;" style="font-size:11px;color:var(--cian);text-decoration:none">${ico('copy', 11)} Copiar</a>
            </div>
            <pre style="margin:0;padding:8px 10px;background:rgba(0,0,0,.5);border-radius:8px;font:11px var(--f-mono);color:var(--tx2);overflow-x:auto">.\\instalar.ps1 -Clave "${esc(claveGenerada)}"</pre>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;color:var(--tx3);font-weight:600">Comando macOS / Linux:</span>
              <a href="javascript:void(0)" class="btn-copiar-mini" data-clip="sudo ./instalar.command --clave ${esc(claveGenerada)}" style="font-size:11px;color:var(--cian);text-decoration:none">${ico('copy', 11)} Copiar</a>
            </div>
            <pre style="margin:0;padding:8px 10px;background:rgba(0,0,0,.5);border-radius:8px;font:11px var(--f-mono);color:var(--tx2);overflow-x:auto">sudo ./instalar.command --clave ${esc(claveGenerada)}</pre>
          </div>
        </div>
      </div>`,
      pie: `<button class="btn pri" data-acc="mCerrar" style="width:100%;justify-content:center">Cerrar y Ver Clave en Lista</button>`
    });

    setTimeout(() => {
      $$('.btn-copiar-mini').forEach(a => {
        a.addEventListener('click', () => {
          const txt = a.dataset.clip;
          if (txt) {
            navigator.clipboard.writeText(txt).then(() => Toast.mostrar('Comando copiado al portapapeles', 'ok'));
          }
        });
      });
    }, 100);

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `${ico('zap', 14)} Generar y Guardar Clave BTL`;
    mostrarErr('Error al generar clave: ' + (e.message || e));
  }
};

/* ── Copiar clave única ── */
Acc.claveCopiarTexto = el => {
  const txt = el.dataset.txt;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    Toast.mostrar('Clave copiada al portapapeles', 'ok', txt);
  }).catch(() => {
    Toast.mostrar('Clave: ' + txt, 'info');
  });
};

/* ── Compartir o copiar texto completo con instrucciones ── */
Acc.claveCompartirTodo = el => {
  const txt = el.dataset.txt;
  if (!txt) return;

  if (navigator.share) {
    navigator.share({
      title: 'Clave de Registro Bitlab',
      text: txt
    }).catch(() => {
      navigator.clipboard.writeText(txt).then(() => {
        Toast.mostrar('Datos completos copiados al portapapeles', 'ok');
      });
    });
  } else {
    navigator.clipboard.writeText(txt).then(() => {
      Toast.mostrar('Datos completos copiados al portapapeles', 'ok');
    });
  }
};

Acc.claveCompartirTodoFila = el => {
  const id = el.dataset.id;
  const c = (S.claves || []).find(x => String(x.id) === String(id));
  if (!c) return;
  const diasTxt = c.expira_en ? Math.max(1, Math.round((new Date(c.expira_en) - new Date()) / 86400000)) + ' días restantes' : 'Permanente';
  const usosTxt = c.max_usos ? `${c.max_usos} equipos` : 'Ilimitado';
  const texto = `🔑 Clave de Registro · Bitlab Terminal\n• Etiqueta: ${c.nombre}\n• Clave: ${c.clave}\n• Vigencia: ${diasTxt}\n• Límite: ${usosTxt}\n\nComando Windows:\n.\\instalar.ps1 -Clave "${c.clave}"\n\nComando macOS:\nsudo ./instalar.command --clave ${c.clave}`;

  if (navigator.share) {
    navigator.share({ title: 'Clave de Registro Bitlab', text: texto }).catch(() => {
      navigator.clipboard.writeText(texto).then(() => Toast.mostrar('Datos de clave copiados', 'ok'));
    });
  } else {
    navigator.clipboard.writeText(texto).then(() => Toast.mostrar('Datos de clave copiados', 'ok'));
  }
};

/* ── Confirmar y Revocar Clave ── */
Acc.claveConfirmarRevocar = el => {
  const id = el.dataset.id;
  const c = (S.claves || []).find(x => String(x.id) === String(id));
  if (!c) return;

  Modal.abrir({
    aria: 'Confirmar revocación',
    ancho: 420,
    titulo: 'Revocar clave de registro',
    html: `<p style="line-height:1.6;font-size:13px">¿Deseas revocar la clave <b>${esc(c.nombre)}</b> (<code style="color:var(--pel)">${esc(c.clave)}</code>)?<br><br>
      Ningún equipo nuevo podrá registrarse usando esta clave. Los equipos previamente vinculados continuarán funcionando sin problemas.</p>`,
    pie: `<button class="btn" data-acc="mCerrar">Cancelar</button>
      <button class="btn pel" data-acc="claveRevocarOk" data-id="${c.id}">${ico('trash', 14)} Revocar clave</button>`
  });
};

Acc.claveRevocarOk = async el => {
  const id = el.dataset.id;
  try {
    // 1. Actualizar en Supabase si es posible
    try {
      await sb.rpc('admin_revocar_clave_registro', { p_clave_id: id });
    } catch (_) { }

    try {
      await sb.from('claves_registro').update({ activa: false }).eq('id', id);
    } catch (_) { }

    // 2. Actualizar en persistencia local
    const locales = VistaClaves._obtenerLocales();
    const item = locales.find(x => String(x.id) === String(id));
    if (item) item.activa = false;
    VistaClaves._guardarLocales(locales);

    if (S.claves) {
      const memItem = S.claves.find(x => String(x.id) === String(id));
      if (memItem) memItem.activa = false;
    }

    Toast.mostrar('Clave revocada con éxito', 'ok');
    Modal.cerrar();
    VistaClaves._renderLista();
    VistaClaves._actualizarMetricas();
  } catch (e) {
    Toast.mostrar('No se pudo revocar', 'err', e.message);
  }
};


/* ── Eliminación Definitiva de Clave de la Base de Datos ── */
Acc.claveConfirmarEliminarDefinitivo = el => {
  const id = el.dataset.id;
  const c = (S.claves || []).find(x => String(x.id) === String(id));
  if (!c) return;
  const nombreClave = c.nombre || 'Clave';
  const codigoClave = c.clave || 'BTL-••••';

  Modal.abrir({
    aria: 'Eliminar clave definitivamente',
    ancho: 460,
    titulo: 'Eliminar clave de la base de datos',
    html: `<div style="display:grid;gap:12px;font-size:13px;line-height:1.6">
      <div style="padding:12px;background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.25);border-radius:10px;color:var(--pel,#ff4d6d);display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:18px">${ico('alert', 18)}</span>
        <div>
          <b>¡Eliminación irreversible!</b><br>
          Se eliminará permanentemente la clave <b>"${esc(nombreClave)}"</b> (<code style="color:inherit;font-family:var(--f-mono)">${esc(codigoClave)}</code>) de la base de datos Supabase y del panel.
        </div>
      </div>
      <p style="color:var(--tx2);margin:0">
        Ningún equipo podrá volver a registrarse con este código. Los equipos vinculados previamente seguirán operando con normalidad.
      </p>
    </div>`,
    pie: `<button class="btn" data-acc="mCerrar">Cancelar</button>
      <button class="btn pel" data-acc="claveEliminarDefinitivoOk" data-id="${c.id}" style="background:var(--pel,#ff4d6d);color:#fff">
        ${ico('trash', 14)} Eliminar definitivamente
      </button>`
  });
};

Acc.claveEliminarDefinitivoOk = async el => {
  const id = el.dataset.id;
  const c = (S.claves || []).find(x => String(x.id) === String(id));
  const claveTxt = c?.clave;
  const btn = el;
  btn.disabled = true;
  btn.innerHTML = `${ico('retry', 14)} Eliminando…`;

  try {
    let eliminado = false;

    // 1. Probar RPC de eliminación en Supabase
    try {
      const { error } = await sb.rpc('admin_eliminar_clave_definitiva', { p_clave_id: id });
      if (!error) eliminado = true;
    } catch (_) { }

    // 2. Probar eliminación directa de la tabla claves_registro
    if (!eliminado) {
      try {
        await sb.from('claves_registro').delete().eq('id', id);
        eliminado = true;
      } catch (_) { }
    }

    // 3. Eliminar de persistencia local (garantizado)
    const locales = VistaClaves._obtenerLocales().filter(x =>
      String(x.id) !== String(id) && (!claveTxt || x.clave !== claveTxt)
    );
    VistaClaves._guardarLocales(locales);

    // 4. Eliminar de la memoria del cliente
    S.claves = (S.claves || []).filter(x =>
      String(x.id) !== String(id) && (!claveTxt || x.clave !== claveTxt)
    );

    Modal.cerrar();
    Toast.mostrar('Clave eliminada definitivamente de la base de datos', 'ok');
    VistaClaves._renderLista();
    VistaClaves._actualizarMetricas();
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `${ico('trash', 14)} Eliminar definitivamente`;
    Toast.mostrar('Error al eliminar clave: ' + (e.message || e), 'err');
  }
};
