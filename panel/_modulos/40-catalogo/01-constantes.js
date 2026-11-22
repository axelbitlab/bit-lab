/* =====================================================================
   CATÁLOGO · Constantes locales (tipos de alerta, sistema, intérprete)
   ===================================================================== */
const TIPO_ALERTA_OPTS=[
 ['cpu','CPU'],
 ['memoria','Memoria'],
 ['disco','Disco'],
 ['proceso','Procesos'],
 ['impresora','Impresoras'],
 ['red','Red'],
 ['sistema','Sistema'],
 ['mantenimiento','Mantenimiento'],
 ['seguridad','Seguridad'],
];

const SISTEMA_OPTS=[
 ['todos','Todos (multi-SO)'],
 ['windows','Windows'],
 ['macos','macOS'],
 ['linux','Linux'],
];

const INTERPRETE_OPTS=[
 ['powershell','PowerShell'],
 ['bash','Bash'],
 ['cmd','CMD'],
 ['zsh','Zsh'],
 ['automatico','Automático'],
];

// Tabla de estilos por tipo de alerta
const TA={
 cpu:{ic:'cpu',c:'var(--ambar)',n:'CPU'},
 memoria:{ic:'activity',c:'var(--indigo)',n:'Memoria'},
 disco:{ic:'hdd',c:'var(--cian)',n:'Disco'},
 proceso:{ic:'layers',c:'var(--lima)',n:'Procesos'},
 impresora:{ic:'print',c:'var(--pel)',n:'Impresoras'},
 red:{ic:'wifi',c:'var(--azul)',n:'Red'},
 sistema:{ic:'shield',c:'var(--tx2)',n:'Sistema'},
 mantenimiento:{ic:'wrench',c:'var(--verde)',n:'Mantenimiento'},
 seguridad:{ic:'lock',c:'var(--pel)',n:'Seguridad'},
};

// Compat: CRUD abierto a todos
const esAdmin=()=>true;
