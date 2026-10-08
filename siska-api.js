/* SISKA V2 — Supabase Compatibility API

 *

 * Tujuan file ini bukan mendesain ulang SISKA.

 * Ia mempertahankan nama/shape fungsi yang dipakai frontend lama,

 * tetapi mengganti sumber data Google Sheets menjadi Supabase.

 *

 * Prasyarat index.html:

 *   <script src="https\://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

 *   <script src="config.js"></script>

 *   <script src="siska-api.js"></script>

 */

(function (global) {

  'use strict';



  const { createClient } = global.supabase;



  const sb = createClient(

    global.SISKA_CONFIG.SUPABASE_URL,

    global.SISKA_CONFIG.SUPABASE_ANON_KEY

  );



  global.SISKA_SUPABASE = sb;



  const STATUS_HADIR = 'Hadir';

  const STATUS_SAKIT = 'Sakit';

  const STATUS_IZIN = 'Izin';

  const STATUS_TANPA = 'Tanpa Keterangan';



  const ADMIN_ROLES = ['Superadmin', 'Admin', 'Kepegawaian'];

  const SISKA_CACHE_TTL = 60 * 1000;
  const SISKA_CACHE = new Map();

  function cacheRead(key) {
    const item = SISKA_CACHE.get(key);
    if (!item) return null;
    if (Date.now() - item.time > SISKA_CACHE_TTL) {
      SISKA_CACHE.delete(key);
      return null;
    }
    return item.value;
  }

  function cacheWrite(key, value) {
    SISKA_CACHE.set(key, { time: Date.now(), value });
    return value;
  }

  function clearSiskaCache() {
    SISKA_CACHE.clear();
  }

  async function fetchAllRows(queryFactory, pageSize = 1000) {
    const all = [];
    let from = 0;
    while (true) {
      const { data, error } = await queryFactory().range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }



  function errMsg(e) {

    return e?.message || String(e || 'Terjadi kesalahan.');

  }



  function clean(v) {

    return String(v ?? '').trim();

  }



  function isoDate(v) {

    if (!v) return '';



    const s = String(v).slice(0, 10);



    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';

  }



  function today() {

    return new Intl.DateTimeFormat('en-CA', {

      timeZone: 'Asia/Jakarta'

    }).format(new Date());

  }



  function isAdmin(profile) {

    return profile && ADMIN_ROLES.includes(profile.role);

  }



  function bool(v) {

    return (

      v === true ||

      v === 1 ||

      String(v).toLowerCase() === 'true'

    );

  }



  function grade(n) {

    if (n === null || n === undefined || n === '') {

      return '-';

    }



    n = Number(n);



    if (n >= 90) return 'SANGAT BAIK';

    if (n >= 80) return 'BAIK';

    if (n >= 70) return 'CUKUP';



    return 'PERLU PEMBINAAN';

  }



  async function session() {

    const {

      data: { session }

    } = await sb.auth.getSession();



    if (!session) return null;



    const {

      data,

      error

    } = await sb

      .from('profiles')

      .select('*')

      .eq('id', session.user.id)

      .single();



    if (error) throw error;



    return data;

  }



  async function requireLogin() {

    const p = await session();



    if (!p || !p.is_active) {

      throw new Error(

        'Sesi tidak valid. Silakan login kembali.'

      );

    }



    return p;

  }



  async function requireAdmin() {

    const p = await requireLogin();



    if (!isAdmin(p)) {

      throw new Error('Akses Admin diperlukan.');

    }



    return p;

  }



  async function login(username, password) {

    username = clean(username);

    password = String(password || '');



    if (!username || !password) {

      return {

        status: 'error',

        message: 'Username dan password wajib diisi.'

      };

    }



    // Akun Auth memakai email internal username@siska.local.

    const email = username.includes('@')

      ? username

      : `${username}@siska.local`;



    const {

      data,

      error

    } = await sb.auth.signInWithPassword({

      email,

      password

    });



    if (error) {

      return {

        status: 'error',

        message: 'Username atau password salah.'

      };

    }



    const p = await session();



    await sb

      .from('login_logs')

      .insert({

        username: p?.username || username,

        role: p?.role || '',

        status: 'SUCCESS'

      });



    return {

      status: 'success',

      role: p.role,

      nama: p.full_name || p.username,

      token: data.session?.access_token || '',

      message: 'Login berhasil.'

    };

  }



  async function logout() {

    await sb.auth.signOut();



    sessionStorage.removeItem('SISKA_SESSION');



    return {

      status: 'success',

      message: 'Logout berhasil.'

    };

  }



  async function getSessionInfo() {

    const p = await session();



    if (!p) {

      return {

        status: 'expired',

        message: 'Sesi tidak ditemukan atau telah berakhir.'

      };

    }



    const {

      data: { session: s }

    } = await sb.auth.getSession();



    return {

      status: 'success',

      username: p.username,

      role: p.role,

      nama: p.full_name || p.username,

      expiry: s?.expires_at

        ? Number(s.expires_at) * 1000

        : null

    };

  }



  async function getSemuaPegawai() {
    await requireLogin();
    const cached = cacheRead('employees');
    if (cached) return cached;
    const data = await fetchAllRows(() => sb.from('employees').select('*').eq('is_active', true).order('name'));
    const profiles = await fetchAllRows(() => sb.from('profiles').select('employee_code,role').eq('is_active', true));
    const roles = Object.fromEntries((profiles || []).map(x => [x.employee_code, x.role]));
    return cacheWrite('employees', (data || []).map(p => ({
      id_pegawai: p.employee_code,
      nama_pegawai: p.name,
      kategori: p.category_name,
      jabatan: p.position_name || '',
      jabatan_id: p.position_id || '',
      jadwal_dasar_id: p.base_schedule_code || 'JD-001',
      is_walikelas: p.walikelas || '-',
      role: roles[p.employee_code] || 'Tidak Ada Akses'
    })));
  }


  async function getMasterKategoriPenilaian() {
    await requireLogin();
    const cached = cacheRead('categories');
    if (cached) return cached;
    const data = await fetchAllRows(() => sb.from('assessment_categories').select('*').order('order_no').order('name'));
    return cacheWrite('categories', (data || []).map(x => ({
      id_kategori: x.category_code,
      nama_kategori: x.name,
      pk1: x.pk1,
      pk2: x.pk2,
      pk3: x.pk3,
      pk4: x.pk4,
      urutan: x.order_no,
      status_aktif: x.is_active
    })));
  }


  async function getMasterJabatan() {
    await requireLogin();
    const cached = cacheRead('positions');
    if (cached) return cached;
    const data = await fetchAllRows(() => sb.from('positions').select('*').eq('is_active', true).order('order_no').order('name'));
    return cacheWrite('positions', (data || []).map(x => ({
      id_jabatan: x.position_code,
      kategori: x.category_name,
      nama_jabatan: x.name,
      status_aktif: x.is_active,
      urutan: x.order_no
    })));
  }


  async function getMasterJadwalDasar() {
    await requireLogin();
    const cached = cacheRead('schedules');
    if (cached) return cached;
    const data = await fetchAllRows(() => sb.from('base_schedules').select('*').order('name'));
    const emps = await fetchAllRows(() => sb.from('employees').select('base_schedule_code').eq('is_active', true));
    const counts = {};
    (emps || []).forEach(x => { counts[x.base_schedule_code] = (counts[x.base_schedule_code] || 0) + 1; });
    return cacheWrite('schedules', (data || []).map(x => ({
      id_jadwal: x.schedule_code,
      nama_jadwal: x.name,
      senin: x.monday,
      selasa: x.tuesday,
      rabu: x.wednesday,
      kamis: x.thursday,
      jumat: x.friday,
      sabtu: x.saturday,
      minggu: x.sunday,
      status_aktif: x.is_active,
      jumlah_pegawai: counts[x.schedule_code] || 0
    })));
  }


  async function getPenugasanPK1(

    tanggal,

    idPegawai

  ) {

    await requireLogin();



    let q = sb

      .from('pk1_assignments')

      .select('*')

      .eq('is_active', true)

      .order('assignment_date', {

        ascending: false

      });



    if (tanggal) {

      q = q.eq('assignment_date', tanggal);

    }



    if (idPegawai) {

      q = q.eq('employee_code', idPegawai);

    }



    const data = await fetchAllRows(() => q);

    return (data || []).map(x => ({

      id_penugasan: x.assignment_code,

      tanggal: x.assignment_date,

      id_pegawai: x.employee_code,

      nama_pegawai: x.employee_name || '',

      jenis: x.type,

      keterangan: x.description,

      created_at: x.created_at,

      created_by: x.created_by || ''

    }));

  }



  async function savePenugasanPK1(

    tanggal,

    idPegawai,

    jenis,

    keterangan

  ) {

    const actor = await requireAdmin();



    tanggal = isoDate(tanggal);

    idPegawai = clean(idPegawai);

    jenis = clean(jenis);

    keterangan = clean(keterangan);



    if (!tanggal) {

      return {

        status: 'error',

        message: 'Tanggal penugasan tidak valid.'

      };

    }



    if (!idPegawai || !keterangan) {

      return {

        status: 'error',

        message:

          'Pegawai dan keterangan wajib diisi.'

      };

    }



    if (!['Tambah', 'Batal'].includes(jenis)) {

      return {

        status: 'error',

        message: 'Jenis penugasan tidak valid.'

      };

    }



    const {

      data: p

    } = await sb

      .from('employees')

      .select('name')

      .eq('employee_code', idPegawai)

      .single();



    const code = `PK1-ASG-${Date.now()}`;



    const {

      error

    } = await sb

      .from('pk1_assignments')

      .insert({

        assignment_code: code,

        assignment_date: tanggal,

        employee_code: idPegawai,

        employee_name: p?.name || '',

        type: jenis,

        description: keterangan,

        is_active: true,

        created_by: actor.username

      });



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Penugasan PK1 berhasil disimpan.'

    };

  }



  async function deletePenugasanPK1(id) {

    await requireAdmin();



    const {

      error

    } = await sb

      .from('pk1_assignments')

      .update({

        is_active: false

      })

      .eq('assignment_code', id);



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Penugasan PK1 dinonaktifkan.'

    };

  }



  async function scheduleForEmployee(p) {

    const {

      data,

      error

    } = await sb

      .from('base_schedules')

      .select('*')

      .eq(

        'schedule_code',

        p.jadwal_dasar_id || 'JD-001'

      )

      .eq('is_active', true)

      .single();



    if (error) throw error;



    return data;

  }



  function calendarDayOfWeek(date) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function addCalendarDays(date, amount) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + amount)).toISOString().slice(0, 10);
  }

  function dayFlag(schedule, date) {
    const dow = calendarDayOfWeek(date);
    const map = {
      0: 'minggu',
      1: 'senin',
      2: 'selasa',
      3: 'rabu',
      4: 'kamis',
      5: 'jumat',
      6: 'sabtu'
    };
    return !!schedule?.[map[dow]];
  }


  async function getPK1Periode(

    startDate,

    endDate

  ) {

    await requireLogin();



    startDate = isoDate(startDate);

    endDate = isoDate(endDate);



    if (

      !startDate ||

      !endDate ||

      endDate < startDate

    ) {

      throw new Error(

        'Periode PK1 tidak valid.'

      );

    }



    const people = await getSemuaPegawai();



    const schedules =

      await getMasterJadwalDasar();



    const sm = Object.fromEntries(

      schedules.map(x => [

        x.id_jadwal,

        x

      ])

    );



    const assign = await fetchAllRows(() => sb.from('pk1_assignments').select('*').eq('is_active', true).gte('assignment_date', startDate).lte('assignment_date', endDate));
    const rows = await fetchAllRows(() => sb.from('pk1_attendance').select('*').gte('attendance_date', startDate).lte('attendance_date', endDate));



    const obligations = {};



    const d0 = new Date(

      startDate + 'T00:00:00+07:00'

    );



    const d1 = new Date(

      endDate + 'T00:00:00+07:00'

    );



    for (const p of people) {

      const sch =

        sm[p.jadwal_dasar_id || 'JD-001'] ||

        sm['JD-001'];



      for (

        let d = new Date(d0);

        d <= d1;

        d.setDate(d.getDate() + 1)

      ) {

        const ds = d.toLocaleDateString('en-CA', {
          timeZone: 'Asia/Jakarta'
        });



        if (dayFlag(sch, ds)) {

          obligations[

            ds + '|' + p.id_pegawai

          ] = true;

        }

      }

    }



    const overrideMap = {};



    for (const a of assign || []) {

      const key =

        a.assignment_date +

        '|' +

        a.employee_code;



      overrideMap[key] = a;



      if (a.type === 'Tambah') {

        obligations[key] = true;

      }



      if (a.type === 'Batal') {

        delete obligations[key];

      }

    }



    const presensi = {};



    // Kompatibilitas historis:

    // presensi yang sudah tersimpan tetap menjadi

    // kewajiban walaupun jadwal dasar pegawai

    // saat ini sudah berubah.

    // Batal eksplisit tetap menang.

    for (const r of rows || []) {

      const key =

        r.attendance_date +

        '|' +

        r.employee_code;



      const ov = overrideMap[key];



      if (ov?.type === 'Batal') {

        continue;

      }



      if (!obligations[key]) {

        obligations[key] = {

          source: 'Data Lama',

          keterangan: 'Data presensi tersimpan'

        };

      }



      if (presensi[key] === undefined) {

        presensi[key] =

          clean(r.status) || '';

      }

    }



    return {

      periode: {

        start: startDate,

        end: endDate

      },

      obligations,

      presensi

    };

  }



  async function simpanBatchPK1Periode(

    startDate,

    endDate,

    dataList

  ) {

    const actor = await requireLogin();



    startDate = isoDate(startDate);

    endDate = isoDate(endDate);



    if (

      !Array.isArray(dataList) ||

      !dataList.length

    ) {

      return {

        status: 'error',

        message: 'Tidak ada data presensi.'

      };

    }



    if (endDate < startDate) {

      throw new Error(

        'Periode PK1 tidak valid.'

      );

    }



    if (endDate > today()) {

      throw new Error(

        'Tanggal belum terjadi sehingga belum dapat diisi.'

      );

    }



    const period =

      await getPK1Periode(

        startDate,

        endDate

      );



    const people =

      await getSemuaPegawai();



    const pm = Object.fromEntries(

      people.map(x => [

        x.id_pegawai,

        x

      ])

    );



    const payload = [];



    for (const x of dataList) {

      const tanggal =

        isoDate(x.tanggal);



      const id =

        clean(x.id_pegawai);



      const status =

        clean(x.status) ||

        STATUS_HADIR;



      const key =

        tanggal + '|' + id;



      if (!period.obligations[key]) {

        continue;

      }



      if (tanggal > today()) {

        continue;

      }



      if (

        ![

          STATUS_HADIR,

          STATUS_SAKIT,

          STATUS_IZIN,

          STATUS_TANPA

        ].includes(status)

      ) {

        continue;

      }



      const p = pm[id];



      if (!p) continue;



      payload.push({

        transaction_code:

          `PK1-${tanggal}-${id}`,

        attendance_date: tanggal,

        employee_code: id,

        employee_name:

          p.nama_pegawai,

        category_snapshot:

          p.kategori,

        status,

        validation:

          x.validasi || '',

        notes:

          x.catatan || '',

        position_snapshot:

          p.jabatan || ''

      });

    }



    if (!payload.length) {

      return {

        status: 'error',

        message:

          'Tidak ada data PK1 yang memenuhi kewajiban.'

      };

    }



    const {

      error

    } = await sb

      .from('pk1_attendance')

      .upsert(

        payload,

        {

          onConflict:

            'attendance_date,employee_code'

        }

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        `PK1 berhasil disimpan. ${payload.length} data diproses.`

    };

  }



  async function simpanBatchPK1Mingguan(

    weekStart,

    dataList

  ) {

    const s = new Date(

      weekStart + 'T00:00:00+07:00'

    );



    const e = new Date(s);



    e.setDate(

      e.getDate() + 6

    );



    return simpanBatchPK1Periode(

      weekStart,

      e.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),

      dataList

    );

  }



  async function getPK1Mingguan(

    weekStart

  ) {

    const s = new Date(

      weekStart + 'T00:00:00+07:00'

    );



    const e = new Date(s);



    e.setDate(

      e.getDate() + 6

    );



    const p =

      await getPK1Periode(

        weekStart,

        e.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

      );



    return Object.entries(

      p.presensi

    ).map(([k, status]) => {

      const [

        tanggal,

        ...id

      ] = k.split('|');



      return {

        tanggal,

        id_pegawai: id.join('|'),

        status

      };

    });

  }



async function simpanBatchPK2V2(
  tanggal,
  jenis,
  nama,
  dataList
) {
  await requireLogin();

  // Normalisasi tanggal
  tanggal = isoDate(tanggal);

  // Tidak boleh mengisi tanggal masa depan
  if (tanggal > today()) {
    throw new Error(
      'Tanggal belum terjadi sehingga belum dapat diisi.'
    );
  }

  // Pastikan data benar-benar ada
  if (!Array.isArray(dataList) || dataList.length === 0) {
    throw new Error(
      'Tidak ada data PK2 yang dapat disimpan.'
    );
  }

  // Bersihkan data yang tidak memiliki ID pegawai
  const validData = dataList.filter(
    x => x && x.id_pegawai
  );

  if (validData.length === 0) {
    throw new Error(
      'Tidak ada data pegawai yang valid untuk disimpan.'
    );
  }

  // Buat payload untuk Supabase
  const timestamp = Date.now();

  const rows = validData.map(
    (x, i) => ({
      transaction_code:
        `PK2-${timestamp}-${i}`,

      activity_date:
        tanggal,

      activity_type:
        jenis || '',

      activity_name:
        nama || '',

      employee_code:
        x.id_pegawai,

      employee_name:
        x.nama_pegawai || '',

      category_snapshot:
        x.kategori || '',

      invited:
        x.diundang === undefined ||
        x.diundang === null
          ? true
          : !!x.diundang,

      attended:
        !!x.hadir,

      position_snapshot:
        x.jabatan || ''
    })
  );

  // Simpan ke Supabase sekaligus
  const {
    data: insertedRows,
    error
  } = await sb
    .from('pk2_activities')
    .insert(rows)
    .select('transaction_code');

  // Kalau Supabase mengembalikan error,
  // jangan pernah tampilkan status sukses.
  if (error) {
    console.error(
      'Gagal menyimpan PK2:',
      error
    );

    throw new Error(
      `Gagal menyimpan PK2: ${error.message || error}`
    );
  }

  // Pastikan row benar-benar dikembalikan
  const jumlahTersimpan =
    Array.isArray(insertedRows)
      ? insertedRows.length
      : 0;

  if (jumlahTersimpan !== rows.length) {
    console.error(
      'Jumlah data PK2 tidak sesuai.',
      {
        dikirim: rows.length,
        tersimpan: jumlahTersimpan
      }
    );

    throw new Error(
      `Data PK2 tidak lengkap. ` +
      `Dikirim ${rows.length} pegawai, ` +
      `tetapi terkonfirmasi ${jumlahTersimpan} data tersimpan.`
    );
  }

  // Berhasil
  return {
    status: 'success',

    message:
      `PK2 ${nama} berhasil disimpan ` +
      `(${jumlahTersimpan} pegawai).`,

    tanggal: tanggal,

    nama_kegiatan: nama,

    jumlah: jumlahTersimpan
  };
}


  async function getPK2Periode(

    tanggal,

    namaKegiatan

  ) {

    await requireLogin();



    let q = sb

      .from('pk2_activities')

      .select('*')

      .eq('activity_date', tanggal);



    if (namaKegiatan) {

      q = q.eq(

        'activity_name',

        namaKegiatan

      );

    }



    const data = await fetchAllRows(() => q);



    const presensi = {};



    (data || []).forEach(r => {

      presensi[

        r.employee_code

      ] = {

        diundang: r.invited,

        hadir: r.attended,

        jenis_kegiatan:

          r.activity_type,

        nama_kegiatan:

          r.activity_name

      };

    });



    return {

      presensi,

      tanggal,

      nama_kegiatan:

        namaKegiatan || ''

    };

  }



  async function getPK3Periode(

    startDate,

    endDate

  ) {

    await requireLogin();



    const data = await fetchAllRows(() => sb.from('pk3_attendance').select('*').gte('attendance_date', startDate).lte('attendance_date', endDate));



    const people =

      await getSemuaPegawai();



    const cm =

      await categoryMap();



    const allowed =

      new Set(

        people

          .filter(p =>

            (

              cm[p.kategori] || []

            ).includes('PK3')

          )

          .map(p =>

            p.id_pegawai

          )

      );



    const presensi = {};



    (data || []).forEach(r => {

      if (

        allowed.has(

          r.employee_code

        )

      ) {

        presensi[

          r.attendance_date +

          '|' +

          r.employee_code

        ] = {

          hadir: r.attended

        };

      }

    });



    return {

      presensi,

      periode: {

        start: startDate,

        end: endDate

      }

    };

  }



  async function simpanBatchPK3Periode(

    startDate,

    endDate,

    dataList

  ) {

    await requireLogin();



    if (endDate < startDate) {

      throw new Error(

        'Periode PK3 tidak valid.'

      );

    }



    if (endDate > today()) {

      throw new Error(

        'Tanggal belum terjadi sehingga belum dapat diisi.'

      );

    }



    const people =

      await getSemuaPegawai();



    const cm =

      await categoryMap();



    const pm = Object.fromEntries(

      people.map(x => [

        x.id_pegawai,

        x

      ])

    );



    const rows = [];



    (dataList || []).forEach(

      x => {

        const p =

          pm[x.id_pegawai];



        if (

          !p ||

          !['Tendik', 'Struktural']

            .includes(p.kategori)

        ) {

          return;

        }



        rows.push({

          transaction_code:

            `PK3-${x.tanggal}-${x.id_pegawai}`,

          attendance_date:

            x.tanggal,

          employee_code:

            x.id_pegawai,

          employee_name:

            p.nama_pegawai,

          category_snapshot:

            p.kategori,

          attended:

            !!x.hadir,

          position_snapshot:

            p.jabatan || ''

        });

      }

    );



    if (rows.length) {

      const {

        error

      } = await sb

        .from('pk3_attendance')

        .upsert(

          rows,

          {

            onConflict:

              'attendance_date,employee_code'

          }

        );



      if (error) throw error;

    }



    return {

      status: 'success',

      message:

        `PK3 berhasil disimpan. ${rows.length} data diproses.`

    };

  }



  async function simpanBatchPK3V2(

    tanggal,

    dataList

  ) {

    return simpanBatchPK3Periode(

      tanggal,

      tanggal,

      dataList

    );

  }



  async function getPK4Periode(startDate, endDate) {
    await requireLogin();
    startDate = isoDate(startDate);
    endDate = isoDate(endDate);
    if (!startDate || !endDate || endDate < startDate) throw new Error('Periode PK4 tidak valid.');

    const people = await getSemuaPegawai();
    const cm = await categoryMap();
    const schedules = await getMasterJadwalDasar();
    const sm = Object.fromEntries(schedules.map(x => [x.id_jadwal, x]));
    const allowed = people.filter(p => (cm[p.kategori] || []).includes('PK4'));
    const allowedSet = new Set(allowed.map(p => p.id_pegawai));

    const obligations = {};

    // Tanggal PK4 diproses sebagai tanggal kalender murni.
    // Tidak menggunakan Date + timezone agar tidak bergeser satu hari.
    for (const p of allowed) {
      const sch = sm[p.jadwal_dasar_id || 'JD-001'] || sm['JD-001'];
      for (let ds = startDate; ds <= endDate; ds = addCalendarDays(ds, 1)) {
        if (!dayFlag(sch, ds)) continue;
        const expected = global.__siskaPk4Expected(ds);
        if (!expected) continue;
        obligations[ds + '|' + p.id_pegawai] = expected;
      }
    }

    const rows = await fetchAllRows(() => sb.from('pk4_attendance').select('*').gte('attendance_date', startDate).lte('attendance_date', endDate));
    const presensi = {};
    for (const r of rows || []) {
      if (!allowedSet.has(r.employee_code)) continue;
      const expected = global.__siskaPk4Expected(r.attendance_date);
      if (expected !== r.activity_type) continue;
      const key = r.attendance_date + '|' + r.employee_code;
      presensi[key] = { hadir: r.attended, jenis_pembiasaan: r.activity_type };
    }

    return {
      periode: { start: startDate, end: endDate },
      obligations,
      presensi,
      schedule: schedules
    };
  }


  async function simpanBatchPK4Periode(

    startDate,

    endDate,

    dataList

  ) {

    await requireLogin();



    if (endDate < startDate) {

      throw new Error(

        'Periode PK4 tidak valid.'

      );

    }



    if (endDate > today()) {

      throw new Error(

        'Tanggal belum terjadi sehingga belum dapat diisi.'

      );

    }



    const people =

      await getSemuaPegawai();



    const cm =

      await categoryMap();



    const pm = Object.fromEntries(people.map(x => [x.id_pegawai, x]));
    const schedules = await getMasterJadwalDasar();
    const sm = Object.fromEntries(schedules.map(x => [x.id_jadwal, x]));

    const rows = [];

    (dataList || []).forEach(x => {
      const p = pm[x.id_pegawai];
      const sch = p ? (sm[p.jadwal_dasar_id || 'JD-001'] || sm['JD-001']) : null;
      const expected = sch && dayFlag(sch, x.tanggal)
        ? global.__siskaPk4Expected(x.tanggal)
        : null;

      if (!expected || !p || !(cm[p.kategori] || []).includes('PK4')) {
        return;
      }

      rows.push({

        transaction_code:

          `PK4-${x.tanggal}-${x.id_pegawai}`,

        attendance_date:

          x.tanggal,

        activity_type:

          expected,

        employee_code:

          x.id_pegawai,

        employee_name:

          p.nama_pegawai,

        category_snapshot:

          p.kategori,

        attended:

          !!x.hadir,

        position_snapshot:

          p.jabatan || ''

      });

    });



    if (rows.length) {

      const {

        error

      } = await sb

        .from('pk4_attendance')

        .upsert(

          rows,

          {

            onConflict:

              'attendance_date,employee_code'

          }

        );



      if (error) throw error;

    }



    return {

      status: 'success',

      message:

        `PK4 berhasil disimpan. ${rows.length} data diproses.`

    };

  }



  async function simpanBatchPK4V2(

    tanggal,

    jenis,

    dataList

  ) {

    return simpanBatchPK4Periode(

      tanggal,

      tanggal,

      (dataList || []).map(

        x => ({

          ...x,

          jenis_pembiasaan:

            global.__siskaPk4Expected(

              tanggal

            )

        })

      )

    );

  }



  global.__siskaPk4Expected = d => {
    const day = calendarDayOfWeek(d);
    return ({
      2: 'Dhuha',
      3: 'Literasi',
      4: 'Olahraga',
      5: 'Pengajian'
    })[day] || null;
  };


  async function categoryMap() {
    const cached = cacheRead('categoryMap');
    if (cached) return cached;
    const c = await getMasterKategoriPenilaian();
    return cacheWrite('categoryMap', Object.fromEntries(
      c.filter(x => x.status_aktif).map(x => [x.nama_kategori, [
        x.pk1 ? 'PK1' : null,
        x.pk2 ? 'PK2' : null,
        x.pk3 ? 'PK3' : null,
        x.pk4 ? 'PK4' : null
      ].filter(Boolean)])
    ));
  }


  async function scorePK1(

    id,

    start,

    end

  ) {

    let q = sb

      .from('pk1_attendance')

      .select(

        'attendance_date,status'

      )

      .eq(

        'employee_code',

        id

      );



    if (start) {

      q = q.gte(

        'attendance_date',

        start

      );

    }



    if (end) {

      q = q.lte(

        'attendance_date',

        end

      );

    }



    const data = await fetchAllRows(() => q);



    // PK1: seluruh hari/kewajiban yang memiliki record dihitung sebagai
    // pembagi. Sakit dan Izin tetap masuk total hari, tetapi hanya Hadir
    // yang masuk pembilang.
    const vals = data || [];

    if (!vals.length) {
      return null;
    }

    const hadir = vals.filter(
      r => r.status === STATUS_HADIR
    ).length;

    return Math.round(
      hadir / vals.length * 100
    );

  }



  async function scoreBool(
    table,
    id,
    start,
    end,
    inviteOnly = false
  ) {
    let q = sb
      .from(table)
      .select('*')
      .eq(
        'employee_code',
        id
      );

    const dateCol =
      table === 'pk2_activities'
        ? 'activity_date'
        : 'attendance_date';

    if (start) {
      q = q.gte(
        dateCol,
        start
      );
    }

    if (end) {
      q = q.lte(
        dateCol,
        end
      );
    }

    const data = await fetchAllRows(() => q);

    let rows = data || [];

    /*
     * PK2 compatibility:
     *
     * Form PK2 lama menyimpan seluruh pegawai dengan invited=false
     * ketika checkbox "Diundang" belum dicentang.
     *
     * Jika pada periode yang sedang dihitung seorang pegawai
     * sama sekali tidak mempunyai record invited=true, data tersebut
     * dianggap sebagai data legacy/default dan seluruh record miliknya
     * tetap dihitung.
     *
     * Jika ada minimal satu invited=true, aturan normal berlaku:
     * hanya record yang benar-benar diundang yang dihitung.
     *
     * Ini mencegah nilai PK2 berubah menjadi "Belum ada data" hanya
     * karena default checkbox lama tersimpan sebagai false.
     */
    if (
      inviteOnly &&
      table === 'pk2_activities'
    ) {
      const hasExplicitInvitation =
        rows.some(
          r => bool(r.invited)
        );

      if (hasExplicitInvitation) {
        rows = rows.filter(
          r => bool(r.invited)
        );
      }
      // Jika tidak ada invited=true sama sekali,
      // gunakan seluruh record sebagai fallback legacy.
    }

    if (!rows.length) {
      return null;
    }

    return Math.round(
      rows.filter(
        r => bool(r.attended)
      ).length /
      rows.length *
      100
    );
  }


  function finalScore(

    indicators,

    s

  ) {

    const vals =

      indicators

        .map(

          k =>

            s[

              k.toLowerCase()

            ]

        )

        .filter(

          v =>

            v !== null &&

            v !== undefined &&

            !Number.isNaN(

              Number(v)

            )

        );



    const total =

      vals.reduce(

        (a, b) =>

          a + Number(b),

        0

      );



    return {

      rerata: vals.length

        ? Math.round(

            total /

              vals.length

          )

        : null,

      totalSkor: total,

      pembagi: vals.length,

      indikator: indicators

    };

  }



  async function getStatistikGrafikV2(

    idPegawai

  ) {

    const p =

      (

        await getSemuaPegawai()

      ).find(

        x =>

          x.id_pegawai ===

          idPegawai

      );



    if (!p) {

      throw new Error(

        'Pegawai tidak ditemukan.'

      );

    }



    const m =

      await categoryMap();



    const inds =

      m[p.kategori] || [];



    // Keempat skor independen, jadi ambil paralel agar grafik individu cepat.
    const [pk1, pk2, pk3, pk4] = await Promise.all([
      inds.includes('PK1')
        ? scorePK1(idPegawai, null, null)
        : Promise.resolve(null),
      inds.includes('PK2')
        ? scoreBool('pk2_activities', idPegawai, null, null, true)
        : Promise.resolve(null),
      inds.includes('PK3')
        ? scoreBool('pk3_attendance', idPegawai, null, null)
        : Promise.resolve(null),
      inds.includes('PK4')
        ? scoreBool('pk4_attendance', idPegawai, null, null)
        : Promise.resolve(null)
    ]);

    const s = { pk1, pk2, pk3, pk4 };

    const f =

      finalScore(

        inds,

        s

      );



    return {

      ...s,

      rerata: f.rerata,

      indikator: inds

    };

  }



  async function getDashboardStats() {
    await requireLogin();

    // Dashboard sebelumnya menghitung skor dengan cara:
    //   42 pegawai x 2-4 query per pegawai x fetchAllRows()
    // sehingga ratusan request/pagination terjadi berurutan.
    //
    // Sekarang data transaksi masing-masing PK dibaca SEKALI secara paralel,
    // lalu skor setiap pegawai dihitung di memory. Ini jauh lebih cepat dan
    // tetap mempertahankan rumus penilaian lama.
    const [people, cats] = await Promise.all([
      getSemuaPegawai(),
      getMasterKategoriPenilaian()
    ]);

    const categoryCounts = {};
    for (const p of people) {
      categoryCounts[p.kategori] =
        (categoryCounts[p.kategori] || 0) + 1;
    }

    const catByName = Object.fromEntries(
      cats.map(c => [c.nama_kategori, c])
    );

    // Ambil seluruh transaksi yang diperlukan hanya sekali.
    // Hanya kolom yang dibutuhkan dashboard yang diambil.
    const [pk1Rows, pk2Rows, pk3Rows, pk4Rows] = await Promise.all([
      fetchAllRows(() =>
        sb.from('pk1_attendance')
          .select('employee_code,status')
      ),
      fetchAllRows(() =>
        sb.from('pk2_activities')
          .select('employee_code,invited,attended')
      ),
      fetchAllRows(() =>
        sb.from('pk3_attendance')
          .select('employee_code,attended')
      ),
      fetchAllRows(() =>
        sb.from('pk4_attendance')
          .select('employee_code,attended')
      )
    ]);

    // Bentuk agregasi per pegawai di memory.
    const pk1Map = new Map();
    for (const r of pk1Rows || []) {
      const id = r.employee_code;
      if (!id) continue;
      let x = pk1Map.get(id);
      if (!x) {
        x = { wajib: 0, hadir: 0 };
        pk1Map.set(id, x);
      }
      // Konsisten dengan scorePK1(): seluruh record hari wajib menjadi
      // pembagi. Sakit/Izin tetap dihitung sebagai hari, bukan sebagai Hadir.
      x.wajib++;
      if (r.status === STATUS_HADIR) x.hadir++;
    }

    const pk2Map = new Map();
    for (const r of pk2Rows || []) {
      const id = r.employee_code;
      if (!id) continue;

      let x = pk2Map.get(id);
      if (!x) {
        x = {
          total: 0,
          hadir: 0,
          invitedTotal: 0,
          invitedHadir: 0
        };
        pk2Map.set(id, x);
      }

      // Simpan seluruh transaksi untuk fallback legacy.
      x.total++;
      if (r.attended) x.hadir++;

      // Simpan juga transaksi yang eksplisit diundang.
      if (bool(r.invited)) {
        x.invitedTotal++;
        if (r.attended) x.invitedHadir++;
      }
    }

    const pk3Map = new Map();
    for (const r of pk3Rows || []) {
      const id = r.employee_code;
      if (!id) continue;
      let x = pk3Map.get(id);
      if (!x) {
        x = { total: 0, hadir: 0 };
        pk3Map.set(id, x);
      }
      x.total++;
      if (r.attended) x.hadir++;
    }

    const pk4Map = new Map();
    for (const r of pk4Rows || []) {
      const id = r.employee_code;
      if (!id) continue;
      let x = pk4Map.get(id);
      if (!x) {
        x = { total: 0, hadir: 0 };
        pk4Map.set(id, x);
      }
      x.total++;
      if (r.attended) x.hadir++;
    }

    const calcBool = map => id => {
      const x = map.get(id);
      if (!x) return null;

      /*
       * Konsisten dengan scoreBool():
       * - bila ada invited=true, hitung hanya yang diundang;
       * - bila seluruh data PK2 untuk pegawai masih invited=false,
       *   gunakan seluruh record sebagai fallback data legacy.
       */
      if (x.invitedTotal > 0) {
        return Math.round(
          x.invitedHadir /
          x.invitedTotal *
          100
        );
      }

      return x.total
        ? Math.round(
            x.hadir /
            x.total *
            100
          )
        : null;
    };

    const calcPK1 = id => {
      const x = pk1Map.get(id);
      return x && x.wajib ? Math.round(x.hadir / x.wajib * 100) : null;
    };

    const avgs = {
      pk1: [],
      pk2: [],
      pk3: [],
      pk4: []
    };

    const scoreRows = [];

    for (const p of people) {
      const inds = catByName[p.kategori] || {};
      const s = {
        pk1: inds.pk1 ? calcPK1(p.id_pegawai) : null,
        pk2: inds.pk2 ? calcBool(pk2Map)(p.id_pegawai) : null,
        pk3: inds.pk3 ? calcBool(pk3Map)(p.id_pegawai) : null,
        pk4: inds.pk4 ? calcBool(pk4Map)(p.id_pegawai) : null
      };

      Object.keys(avgs).forEach(k => {
        if (s[k] != null) avgs[k].push(s[k]);
      });

      scoreRows.push({ p, inds, s });
    }

    const avg = k =>
      avgs[k].length
        ? Math.round(
            avgs[k].reduce((a, b) => a + b, 0) /
            avgs[k].length
          )
        : null;

    // Recent activity tetap hanya mengambil 10 data per PK,
    // tetapi keempat query dijalankan paralel.
    const recentSources = [
      ['pk1_attendance', 'attendance_date', 'status'],
      ['pk2_activities', 'activity_date', 'activity_name'],
      ['pk3_attendance', 'attendance_date', 'attended'],
      ['pk4_attendance', 'attendance_date', 'activity_type']
    ];

    const recentResults = await Promise.all(
      recentSources.map(([table, dateCol]) =>
        sb.from(table)
          .select('*')
          .order(dateCol, { ascending: false })
          .limit(10)
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
      )
    );

    const recent = [];

    recentSources.forEach(([table, dateCol], index) => {
      for (const x of recentResults[index]) {
        recent.push({
          tanggal: x[dateCol],
          nama_pegawai: x.employee_name,
          jenis_pk:
            table === 'pk1_attendance'
              ? 'PK 1 · Presensi'
              : table === 'pk2_activities'
                ? 'PK 2 · Kegiatan'
                : table === 'pk3_attendance'
                  ? 'PK 3 · Piket'
                  : 'PK 4 · Pembiasaan',
          kegiatan:
            table === 'pk2_activities'
              ? x.activity_name
              : table === 'pk4_attendance'
                ? x.activity_type
                : table === 'pk3_attendance'
                  ? 'Piket Harian'
                  : 'Presensi',
          status:
            table === 'pk1_attendance'
              ? x.status
              : x.attended
                ? 'Hadir'
                : 'Tidak Hadir'
        });
      }
    });

    recent.sort((a, b) =>
      String(b.tanggal).localeCompare(String(a.tanggal))
    );

    const rules = Object.fromEntries(
      cats
        .filter(c => c.status_aktif)
        .map(c => [
          c.nama_kategori,
          [
            c.pk1 ? 'PK1' : null,
            c.pk2 ? 'PK2' : null,
            c.pk3 ? 'PK3' : null,
            c.pk4 ? 'PK4' : null
          ].filter(Boolean)
        ])
    );

    return {
      total: people.length,
      categoryCounts,
      categories: cats,
      avgPK1: avg('pk1'),
      avgPK2: avg('pk2'),
      avgPK3: avg('pk3'),
      avgPK4: avg('pk4'),
      recent: recent.slice(0, 10),
      rules,
      jmlGuru: categoryCounts.Guru || 0,
      jmlTendik: categoryCounts.Tendik || 0,
      jmlStruktural: categoryCounts.Struktural || 0
    };
  }

  async function getDataLaporanCetakV2(

    filterId,

    startDate,

    endDate,

    categoryFilter

  ) {

    await requireLogin();



    let people =

      await getSemuaPegawai();



    const category =

      clean(

        categoryFilter || 'SEMUA'

      );



    if (

      category &&

      category !== 'SEMUA'

    ) {

      people =

        people.filter(

          p =>

            p.kategori.toLowerCase() ===

            category.toLowerCase()

        );

    }



    if (

      filterId &&

      filterId !== 'SEMUA'

    ) {

      people =

        people.filter(

          p =>

            p.id_pegawai ===

            filterId

        );

    }



    const cm =

      await categoryMap();



    const out = [];



    for (const p of people) {

      const inds =

        cm[p.kategori] || [];



      const s = {

        pk1:

          inds.includes('PK1')

            ? await scorePK1(

                p.id_pegawai,

                startDate,

                endDate

              )

            : null,



        pk2:

          inds.includes('PK2')

            ? await scoreBool(

                'pk2_activities',

                p.id_pegawai,

                startDate,

                endDate,

                true

              )

            : null,



        pk3:

          inds.includes('PK3')

            ? await scoreBool(

                'pk3_attendance',

                p.id_pegawai,

                startDate,

                endDate

              )

            : null,



        pk4:

          inds.includes('PK4')

            ? await scoreBool(

                'pk4_attendance',

                p.id_pegawai,

                startDate,

                endDate

              )

            : null

      };



      const f =

        finalScore(

          inds,

          s

        );



      const logs = [];



      for (

        const [

          table,

          dateCol

        ] of [

          [

            'pk1_attendance',

            'attendance_date'

          ],

          [

            'pk2_activities',

            'activity_date'

          ],

          [

            'pk3_attendance',

            'attendance_date'

          ],

          [

            'pk4_attendance',

            'attendance_date'

          ]

        ]

      ) {

        let q = sb

          .from(table)

          .select('*')

          .eq(

            'employee_code',

            p.id_pegawai

          )

          .gte(

            dateCol,

            startDate ||

              '1900-01-01'

          )

          .lte(

            dateCol,

            endDate ||

              '2999-12-31'

          );



        const r = await fetchAllRows(() => q);

        (r || []).forEach(x => {

          logs.push({

            tanggal:

              x[dateCol],



            jenis_pk:

              table ===

              'pk1_attendance'

                ? 'PK 1 · Presensi'

                : table ===

                  'pk2_activities'

                  ? 'PK 2 · Kegiatan'

                  : table ===

                    'pk3_attendance'

                    ? 'PK 3 · Piket'

                    : 'PK 4 · Pembiasaan',



            kegiatan:

              table ===

              'pk2_activities'

                ? x.activity_name

                : table ===

                  'pk4_attendance'

                  ? x.activity_type

                  : table ===

                    'pk3_attendance'

                    ? 'Piket Harian'

                    : 'Presensi',



            status:

              table ===

              'pk1_attendance'

                ? x.status

                : x.attended

                  ? 'Hadir'

                  : 'Tidak Hadir',



            is_hadir:

              table ===

              'pk1_attendance'

                ? x.status ===

                  'Hadir'

                : !!x.attended

          });

        });

      }



      logs.sort(

        (a, b) =>

          String(

            b.tanggal

          ).localeCompare(

            String(a.tanggal)

          )

      );



      out.push({

        info: p,

        statistik: s,

        rerata: f.rerata,

        total_skor:

          f.totalSkor,

        pembagi:

          f.pembagi,

        grade:

          grade(f.rerata),

        indikator: inds,

        log_kegiatan:

          logs

      });

    }



    return out;

  }



  async function getDataExportExcelV2(

    startDate,

    endDate

  ) {

    const r =

      await getRekapKepegawaianV2(

        startDate,

        endDate,

        'NILAI',

        'SEMUA'

      );



    return r.groups || {};

  }



  async function getRekapKepegawaianV2(

    startDate,

    endDate,

    jenis,

    categoryFilter

  ) {

    await requireLogin();



    const cats =

      (

        await getMasterKategoriPenilaian()

      ).filter(

        x => x.status_aktif

      );



    const catName =

      clean(

        categoryFilter ||

          'SEMUA'

      );



    let people =

      await getSemuaPegawai();



    if (catName !== 'SEMUA') {

      people =

        people.filter(

          p =>

            p.kategori ===

            catName

        );

    }



    const catOrder =

      Object.fromEntries(

        cats.map(x => [

          x.nama_kategori,

          x.urutan

        ])

      );



    const jobs =

      await getMasterJabatan();



    const jobOrder =

      Object.fromEntries(

        jobs.map(x => [

          x.kategori +

            '||' +

            x.nama_jabatan,

          x.urutan

        ])

      );



    people.sort(

      (a, b) =>

        (

          catOrder[a.kategori] ??

          999

        ) -

          (

            catOrder[b.kategori] ??

            999

          ) ||

        (

          jobOrder[

            a.kategori +

            '||' +

            a.jabatan

          ] ??

          999

        ) -

          (

            jobOrder[

              b.kategori +

              '||' +

              b.jabatan

            ] ??

            999

          ) ||

        a.nama_pegawai.localeCompare(

          b.nama_pegawai,

          'id'

        )

    );



    const groups = {};



    if (

      String(

        jenis ||

          'NILAI'

      ).toUpperCase() ===

      'PRESENSI'

    ) {

      const rows = await fetchAllRows(() =>
        sb
          .from('pk1_attendance')
          .select('*')
          .gte(
            'attendance_date',
            startDate ||
              '1900-01-01'
          )
          .lte(
            'attendance_date',
            endDate ||
              '2999-12-31'
          )
      );



      const by = {};



      (rows || []).forEach(

        r => {

          const k =

            r.employee_code;



          by[k] ??= {

            wajib: 0,

            hadir: 0,

            sakit: 0,

            izin: 0,

            alfa: 0

          };



          const x = by[k];



          // Setiap record PK1 dalam periode merupakan satu hari wajib.
          // Status Sakit/Izin tetap masuk total hari agar persentase
          // kehadiran tidak otomatis menjadi 100% ketika guru tidak hadir.
          x.wajib++;

          if (

            r.status ===

            'Sakit'

          ) {

            x.sakit++;

            return;

          }



          if (

            r.status ===

            'Izin'

          ) {

            x.izin++;

            return;

          }



          if (

            r.status ===

            'Hadir'

          ) {

            x.hadir++;

          } else {

            x.alfa++;

          }

        }

      );



      people.forEach(

        p => {

          const x =

            by[p.id_pegawai] ||

            {

              wajib: 0,

              hadir: 0,

              sakit: 0,

              izin: 0,

              alfa: 0

            };



          const row = {

            No: 0,

            ID: p.id_pegawai,

            Nama: p.nama_pegawai,

            Kategori: p.kategori,

            Jabatan: p.jabatan,

            Hadir: x.hadir,

            Sakit: x.sakit,

            Izin: x.izin,

            Alfa: x.alfa,

            'Total Hari':

              x.wajib,

            Kewajiban:

              x.wajib,

            '% Kehadiran':

              x.wajib

                ? Math.round(

                    x.hadir /

                      x.wajib *

                      100

                  ) + '%'

                : '-'

          };



          (

            groups[p.kategori] ??= []

          ).push(row);

        }

      );

    } else {

      const cm =

        await categoryMap();



      for (const p of people) {

        const inds =

          cm[p.kategori] ||

          [];



        const s = {

          pk1:

            inds.includes('PK1')

              ? await scorePK1(

                  p.id_pegawai,

                  startDate,

                  endDate

                )

              : null,



          pk2:

            inds.includes('PK2')

              ? await scoreBool(

                  'pk2_activities',

                  p.id_pegawai,

                  startDate,

                  endDate,

                  true

                )

              : null,



          pk3:

            inds.includes('PK3')

              ? await scoreBool(

                  'pk3_attendance',

                  p.id_pegawai,

                  startDate,

                  endDate

                )

              : null,



          pk4:

            inds.includes('PK4')

              ? await scoreBool(

                  'pk4_attendance',

                  p.id_pegawai,

                  startDate,

                  endDate

                )

              : null

        };



        const f =

          finalScore(

            inds,

            s

          );



        const row = {

          No: 0,

          ID: p.id_pegawai,

          Nama: p.nama_pegawai,

          Kategori: p.kategori,

          Jabatan: p.jabatan,

          PK1:

            s.pk1 ?? '-',

          PK2:

            s.pk2 ?? '-',

          PK3:

            s.pk3 ?? '-',

          PK4:

            s.pk4 ?? '-',

          'Nilai Akhir':

            f.rerata ?? '-',

          Predikat:

            grade(f.rerata)

        };



        (

          groups[p.kategori] ??= []

        ).push(row);

      }

    }



    Object.keys(

      groups

    ).forEach(k =>

      groups[k].forEach(

        (r, i) => {

          r.No = i + 1;

        }

      )

    );



    return {

      jenis: String(

        jenis || 'NILAI'

      ).toUpperCase(),



      periode: {

        start:

          startDate || '',

        end:

          endDate || ''

      },



      groups,



      categories: cats

    };

  }



async function getRiwayatPKAgregasiV2(
  pk,
  page,
  limit,
  filterDate,
  search
) {
  await requireLogin();

  const pkNumber = Number(pk);

  // =========================================================
  // 1. Tentukan tabel berdasarkan PK
  // =========================================================

  const tableMap = {
    1: 'pk1_attendance',
    2: 'pk2_activities',
    3: 'pk3_attendance',
    4: 'pk4_attendance'
  };

  const table = tableMap[pkNumber];

  if (!table) {
    return {
      data: [],
      total: 0
    };
  }

  // =========================================================
  // 2. Tentukan kolom tanggal
  // =========================================================

  const dateCol =
    pkNumber === 2
      ? 'activity_date'
      : 'attendance_date';

  // =========================================================
  // 3. Query data
  // =========================================================

  let q = sb
    .from(table)
    .select('*');

  if (filterDate) {
    q = q.eq(
      dateCol,
      filterDate
    );
  }

  /*
   * fetchAllRows() digunakan agar data tidak berhenti
   * pada limit default Supabase.
   */
  const rows = await fetchAllRows(
    () => q
  );

  // =========================================================
  // 4. Normalisasi search
  // =========================================================

  const searchText = clean(search).toLowerCase();

  // =========================================================
  // 5. Grouping transaksi
  // =========================================================

  const grouped = {};

  for (const r of rows || []) {

    // -------------------------------------------------------
    // Tanggal
    // -------------------------------------------------------

    const date = r[dateCol];

    if (!date) {
      continue;
    }

    // -------------------------------------------------------
    // Nama kegiatan
    // -------------------------------------------------------

    let activity = '';

    if (pkNumber === 1) {

      activity = 'Presensi Mingguan';

    } else if (pkNumber === 2) {

      /*
       * PK2 mengambil nama kegiatan langsung dari
       * activity_name.
       *
       * PENTING:
       * Jangan filter berdasarkan invited.
       *
       * invited hanya menunjukkan apakah pegawai tersebut
       * diundang pada kegiatan tersebut.
       *
       * Kegiatan tetap merupakan transaksi PK2 yang valid
       * meskipun invited = false.
       */

      activity = clean(
        r.activity_name
      );

    } else if (pkNumber === 3) {

      activity = 'Piket Harian';

    } else if (pkNumber === 4) {

      activity = clean(
        r.activity_type
      );

      /*
       * Jika PK4 tidak mempunyai jenis kegiatan,
       * transaksi tidak dapat ditampilkan sebagai riwayat
       * yang valid.
       */
      if (!activity) {
        continue;
      }
    }

    // -------------------------------------------------------
    // Pastikan nama kegiatan tidak kosong
    // -------------------------------------------------------

    if (!activity) {
      continue;
    }

    // =======================================================
    // 6. Filter pencarian
    // =======================================================

    if (
      searchText &&
      !activity
        .toLowerCase()
        .includes(searchText)
    ) {
      continue;
    }

    // =======================================================
    // 7. Buat key grouping
    //
    // Satu kegiatan pada tanggal yang sama menjadi
    // satu baris riwayat.
    // =======================================================

    const key =
      String(date) +
      '||' +
      activity;

    if (!grouped[key]) {

      grouped[key] = {
        tanggal: date,

        kegiatan: activity,

        total_pegawai: 0,

        hadir: 0,

        id_transaksi_pertama:
          r.transaction_code || ''
      };
    }

    // =======================================================
    // 8. Hitung jumlah pegawai
    // =======================================================

    grouped[key].total_pegawai++;

    // =======================================================
    // 9. Hitung jumlah hadir
    // =======================================================

    let hadir = false;

    if (pkNumber === 1) {

      /*
       * PK1 menggunakan kolom status.
       */
      hadir =
        clean(r.status) ===
        STATUS_HADIR;

    } else {

      /*
       * PK2, PK3, PK4 menggunakan attended.
       */
      hadir = !!r.attended;
    }

    if (hadir) {
      grouped[key].hadir++;
    }
  }

  // =========================================================
  // 10. Ubah object menjadi array
  // =========================================================

  const arr = Object.values(
    grouped
  );

  // =========================================================
  // 11. Hitung persentase kehadiran
  //
  // Tidak mengubah field yang sudah digunakan UI.
  // Kita tambahkan hanya jika dibutuhkan oleh frontend.
  // =========================================================

  for (const item of arr) {

    item.persentase =
      item.total_pegawai > 0
        ? Math.round(
            (
              item.hadir /
              item.total_pegawai
            ) * 100
          )
        : 0;
  }

  // =========================================================
  // 12. Sorting
  //
  // Terbaru → terlama.
  // Jika tanggal sama, nama kegiatan A-Z.
  // =========================================================

  arr.sort(
    (a, b) => {

      const dateCompare =
        String(b.tanggal)
          .localeCompare(
            String(a.tanggal)
          );

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return String(a.kegiatan)
        .localeCompare(
          String(b.kegiatan),
          'id'
        );
    }
  );

  // =========================================================
  // 13. Pagination
  // =========================================================

  const pg =
    Math.max(
      1,
      Number(page) || 1
    );

  const lim =
    Math.max(
      1,
      Number(limit) || 8
    );

  const start =
    (pg - 1) * lim;

  const data =
    arr.slice(
      start,
      start + lim
    );

  // =========================================================
  // 14. Return
  // =========================================================

  return {
    data: data,

    total: arr.length
  };
}


  async function getDetailRiwayatV2(

    pk,

    tanggal,

    kegiatan

  ) {

    await requireLogin();



    const table = {

      1: 'pk1_attendance',

      2: 'pk2_activities',

      3: 'pk3_attendance',

      4: 'pk4_attendance'

    }[Number(pk)];



    if (!table) {

      return [];

    }



    const dateCol =

      pk == 2

        ? 'activity_date'

        : 'attendance_date';



    let q = sb

      .from(table)

      .select('*')

      .eq(

        dateCol,

        tanggal

      );



    if (

      pk == 2 &&

      kegiatan

    ) {

      q = q.eq(

        'activity_name',

        kegiatan

      );

    }



    if (

      pk == 4 &&

      kegiatan

    ) {

      q = q.eq(

        'activity_type',

        kegiatan

      );

    }



    const data = await fetchAllRows(() => q);

    return (data || []).map(

      r => ({

        id_transaksi:

          r.transaction_code,



        id_pegawai:

          r.employee_code,



        nama_pegawai:

          r.employee_name,



        kategori:

          r.category_snapshot,



        status:

          pk == 1

            ? r.status

            : (

                r.attended

                  ? 'Hadir'

                  : 'Tidak Hadir'

              ),



        diundang:

          pk == 2

            ? r.invited

            : null

      })

    );

  }



  async function deleteRiwayatByTanggalKegiatanV2(

    pk,

    tanggal,

    kegiatan

  ) {

    await requireAdmin();



    const table = {

      1: 'pk1_attendance',

      2: 'pk2_activities',

      3: 'pk3_attendance',

      4: 'pk4_attendance'

    }[Number(pk)];



    if (!table) {

      return {

        status: 'error',

        message:

          'Jenis PK tidak valid.'

      };

    }



    const dateCol =

      pk == 2

        ? 'activity_date'

        : 'attendance_date';



    let q = sb

      .from(table)

      .delete()

      .eq(

        dateCol,

        tanggal

      );



    if (

      pk == 2 &&

      kegiatan

    ) {

      q = q.eq(

        'activity_name',

        kegiatan

      );

    }



    if (

      pk == 4 &&

      kegiatan

    ) {

      q = q.eq(

        'activity_type',

        kegiatan

      );

    }



    const {

      error

    } = await q;



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Riwayat berhasil dihapus.'

    };

  }



  async function saveMasterKategoriPenilaian(

    id,

    nama,

    pk1,

    pk2,

    pk3,

    pk4,

    urutan,

    statusAktif

  ) {
    clearSiskaCache();

    await requireAdmin();



    if (

      ![

        pk1,

        pk2,

        pk3,

        pk4

      ].some(Boolean)

    ) {

      return {

        status: 'error',

        message:

          'Minimal pilih satu PK yang dinilai.'

      };

    }



    const {

      error

    } = await sb

      .from(

        'assessment_categories'

      )

      .upsert(

        {

          category_code: id,

          name: nama,

          pk1: !!pk1,

          pk2: !!pk2,

          pk3: !!pk3,

          pk4: !!pk4,

          order_no:

            Math.max(

              1,

              Number(urutan) || 1

            ),

          is_active:

            statusAktif !== false

        },

        {

          onConflict:

            'category_code'

        }

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Kategori penilaian berhasil disimpan.'

    };

  }



  async function deleteMasterKategoriPenilaian(

    id

  ) {
    clearSiskaCache();

    await requireAdmin();



    const {

      error

    } = await sb

      .from(

        'assessment_categories'

      )

      .update({

        is_active: false

      })

      .eq(

        'category_code',

        id

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Kategori dinonaktifkan. Data penilaian lama tetap aman.'

    };

  }



  async function saveMasterJadwalDasar(

    id,

    nama,

    senin,

    selasa,

    rabu,

    kamis,

    jumat,

    sabtu,

    minggu,

    statusAktif

  ) {
    clearSiskaCache();

    await requireAdmin();



    const {

      error

    } = await sb

      .from('base_schedules')

      .upsert(

        {

          schedule_code: id,

          name: nama,

          monday: !!senin,

          tuesday: !!selasa,

          wednesday: !!rabu,

          thursday: !!kamis,

          friday: !!jumat,

          saturday: !!sabtu,

          sunday: !!minggu,

          is_active:

            statusAktif !== false

        },

        {

          onConflict:

            'schedule_code'

        }

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Jadwal dasar berhasil disimpan.'

    };

  }



  async function setJadwalDasarPegawai(

    idPegawai,

    jadwalId

  ) {
    clearSiskaCache();

    await requireAdmin();



    const {

      error

    } = await sb

      .from('employees')

      .update({

        base_schedule_code:

          jadwalId

      })

      .eq(

        'employee_code',

        idPegawai

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Jadwal mingguan pegawai diperbarui.'

    };

  }



  async function saveMasterJabatan(

    id,

    kategori,

    nama,

    statusAktif,

    urutan

  ) {
    clearSiskaCache();

    await requireAdmin();



    const {

      error

    } = await sb

      .from('positions')

      .upsert(

        {

          position_code: id,

          category_name: kategori,

          name: nama,

          is_active:

            statusAktif !== false,

          order_no:

            Math.max(

              1,

              Number(urutan) || 1

            )

        },

        {

          onConflict:

            'position_code'

        }

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Jabatan berhasil disimpan.'

    };

  }



  async function updatePegawaiV2(

    id,

    nama,

    kategori,

    jabatan,

    walikelas,

    jadwalId

  ) {
    clearSiskaCache();

    const actor =

      await requireAdmin();



    const {

      data: old

    } = await sb

      .from('employees')

      .select('*')

      .eq(

        'employee_code',

        id

      )

      .single();



    if (!old) {

      return {

        status: 'error',

        message:

          'Pegawai tidak ditemukan.'

      };

    }



    const {

      data: pos

    } = await sb

      .from('positions')

      .select('id')

      .eq(

        'category_name',

        kategori

      )

      .eq(

        'name',

        jabatan

      )

      .maybeSingle();



    const {

      error

    } = await sb

      .from('employees')

      .update({

        name: nama,

        category_name: kategori,

        position_id:

          pos?.id || null,

        position_name:

          jabatan,

        walikelas:

          walikelas || '-',

        base_schedule_code:

          jadwalId || 'JD-001',

        profile_changed_at:

          new Date().toISOString()

      })

      .eq(

        'employee_code',

        id

      );



    if (error) throw error;



    if (

      old.category_name !==

        kategori ||

      old.position_name !==

        jabatan

    ) {

      await sb

        .from('profile_logs')

        .insert({

          employee_code: id,

          category_old:

            old.category_name,

          position_old:

            old.position_name,

          category_new:

            kategori,

          position_new:

            jabatan,

          actor:

            actor.username

        });

    }



    return {

      status: 'success',

      message:

        'Profil pegawai berhasil diperbarui.'

    };

  }



  async function deletePegawai(id) {
    clearSiskaCache();

    await requireAdmin();



    const {

      error

    } = await sb

      .from('employees')

      .update({

        is_active: false

      })

      .eq(

        'employee_code',

        id

      );



    if (error) throw error;



    return {

      status: 'success',

      message:

        'Pegawai dinonaktifkan. Riwayat penilaian tetap aman.'

    };

  }



  async function addPegawaiV2(

    nama,

    kategori,

    jabatan,

    walikelas,

    role,

    username,

    password,

    jadwalId

  ) {
    clearSiskaCache();

    await requireAdmin();



    nama = clean(nama);

    kategori = clean(kategori);

    jabatan = clean(jabatan);

    jadwalId =

      clean(jadwalId) ||

      'JD-001';



    if (

      !nama ||

      !kategori ||

      !jabatan

    ) {

      return {

        status: 'error',

        message:

          'Nama, kategori, dan jabatan wajib diisi.'

      };

    }



    const {

      data: exists

    } = await sb

      .from('employees')

      .select(

        'employee_code'

      )

      .eq(

        'is_active',

        true

      )

      .order(

        'employee_code',

        {

          ascending: false

        }

      )

      .limit(1)

      .maybeSingle();



    let n = 0;



    const m =

      String(

        exists?.employee_code ||

          ''

      ).match(

        /SMKG-(\d+)/i

      );



    if (m) {

      n = Number(m[1]);

    }



    const id =

      'SMKG-' +

      String(n + 1).padStart(

        3,

        '0'

      );



    const {

      data: pos

    } = await sb

      .from('positions')

      .select('id')

      .eq(

        'category_name',

        kategori

      )

      .eq(

        'name',

        jabatan

      )

      .maybeSingle();



    const {

      error

    } = await sb

      .from('employees')

      .insert({

        employee_code: id,

        name: nama,

        category_name:

          kategori,

        position_id:

          pos?.id || null,

        position_name:

          jabatan,

        walikelas:

          walikelas || '-',

        base_schedule_code:

          jadwalId,

        is_active: true,

        profile_changed_at:

          new Date().toISOString()

      });



    if (error) throw error;



    if (

      role &&

      role !==

        'Tidak Ada Akses'

    ) {

      await adminAction(

        'upsertUserForPegawai',

        {

          employeeCode: id,

          role,

          username,

          password

        }

      );

    }



    return {

      status: 'success',

      message:

        `Pegawai ${nama} berhasil ditambahkan dengan ID ${id}.`,

      id_pegawai: id

    };

  }



  async function adminAction(

    action,

    payload

  ) {

    const {

      data: {

        session: s

      }

    } =

      await sb.auth.getSession();



    if (!s) {

      throw new Error(

        'Sesi tidak valid.'

      );

    }



    const {

      data,

      error

    } = await sb.functions.invoke(

      'siska-admin',

      {

        body: {

          action,

          ...payload

        },

        headers: {

          Authorization:

            `Bearer ${s.access_token}`

        }

      }

    );



    if (error) throw error;



    return data;

  }



  async function getAllUsers() {

    await requireAdmin();



    const {

      data,

      error

    } = await sb

      .from('profiles')

      .select(

        'username,role,employee_code,is_active'

      )

      .order('username');



    if (error) throw error;



    return (data || [])

      .filter(

        x =>

          x.is_active !== false

      )

      .map(x => ({

        username:

          x.username,

        role:

          x.role,

        id_pegawai:

          x.employee_code ||

          '-'

      }));

  }



  async function createUser(

    username,

    password,

    role,

    idPegawai

  ) {

    return adminAction(

      'createUser',

      {

        username,

        password,

        role,

        employeeCode:

          idPegawai || ''

      }

    );

  }



  async function updateUser(

    oldUsername,

    newUsername,

    newPassword,

    role,

    idPegawai

  ) {

    return adminAction(

      'updateUser',

      {

        oldUsername,

        username:

          newUsername,

        password:

          newPassword,

        role,

        employeeCode:

          idPegawai || ''

      }

    );

  }



  async function deleteUser(

    username

  ) {

    return adminAction(

      'deleteUser',

      {

        username

      }

    );

  }



  async function upsertUserForPegawai(

    idPegawai,

    role,

    username,

    password

  ) {

    return adminAction(

      'upsertUserForPegawai',

      {

        employeeCode:

          idPegawai,

        role,

        username,

        password

      }

    );

  }



  async function callServer(

    fn,

    args,

    cb

  ) {

    try {

      const a =

        Array.isArray(args)

          ? args

          : [];



      let result;



      if (

        fn ===

        'prosesLogin'

      ) {

        result =

          await login(

            ...a

          );

      } else if (

        fn === 'logout'

      ) {

        result =

          await logout(

            ...a

          );

      } else if (

        fn ===

        'getSessionInfo'

      ) {

        result =

          await getSessionInfo(

            ...a

          );

      } else if (

        typeof api[fn] ===

        'function'

      ) {

        result =

          await api[fn](

            ...a

          );

      } else {

        throw new Error(

          `Fungsi SISKA tidak ditemukan: ${fn}`

        );

      }



      cb?.(result);



      return result;



    } catch (e) {

      console.error(

        '[SISKA]',

        fn,

        e

      );



      if (cb) {

        cb({

          status: 'error',

          message:

            errMsg(e)

        });



        return {

          status: 'error',

          message:

            errMsg(e)

        };

      }



      throw e;

    }

  }



  const api = {

    login,

    logout,

    getSessionInfo,



    getSemuaPegawai,



    getMasterKategoriPenilaian,

    getMasterJabatan,

    getMasterJadwalDasar,



    getPenugasanPK1,

    savePenugasanPK1,

    deletePenugasanPK1,



    getPK1Periode,

    simpanBatchPK1Periode,

    simpanBatchPK1Mingguan,

    getPK1Mingguan,



    simpanBatchPK2V2,

    getPK2Periode,



    getPK3Periode,

    simpanBatchPK3Periode,

    simpanBatchPK3V2,



    getPK4Periode,

    simpanBatchPK4Periode,

    simpanBatchPK4V2,



    getStatistikGrafikV2,



    getDashboardStats,



    getDataLaporanCetakV2,

    getRekapKepegawaianV2,

    getDataExportExcelV2,



    getRiwayatPKAgregasiV2,
    getDetailRiwayatV2,

    deleteRiwayatByTanggalKegiatanV2,



    saveMasterKategoriPenilaian,

    deleteMasterKategoriPenilaian,



    saveMasterJadwalDasar,

    setJadwalDasarPegawai,



    saveMasterJabatan,



    addPegawaiV2,

    updatePegawaiV2,

    deletePegawai,



    getAllUsers,

    createUser,

    updateUser,

    deleteUser,

    upsertUserForPegawai,

    clearSiskaCache

  };



  global.SISKA_API = api;

  global.callServer = callServer;



})(window);