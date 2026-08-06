import { getState, notifyNow, push, pushGPS, pushRawGps, pushRawPoint } from './store'

export const WAYPOINTS: Array<[number, number]> = [
  [37.0011529, -86.36837867], [37.00122817, -86.3682181], [37.00133071, -86.36801267],
  [37.00143614, -86.36779264], [37.00152389, -86.3675912], [37.00160574, -86.36740819],
  [37.00167596, -86.36725066], [37.00175285, -86.36709064], [37.00183166, -86.36691875],
  [37.00192538, -86.36670617], [37.00200136, -86.36653034], [37.00208623, -86.36635086],
  [37.00215644, -86.36619701], [37.00222549, -86.36603626], [37.00229839, -86.3658645],
  [37.00237732, -86.36569622], [37.00245038, -86.36553914], [37.00252912, -86.36537128],
  [37.00259904, -86.36521818], [37.00266755, -86.36507091], [37.00274639, -86.36490341],
  [37.00283342, -86.36471029], [37.00291248, -86.36454704], [37.00298517, -86.36439075],
  [37.0030636, -86.36423803], [37.00313338, -86.36408574], [37.00320937, -86.36393701],
  [37.00330797, -86.36377724], [37.00343811, -86.36368662], [37.00357758, -86.36365019],
  [37.00372489, -86.36360692], [37.00388711, -86.36356354], [37.00405472, -86.36352621],
  [37.00423763, -86.36348621], [37.00437129, -86.36338074], [37.00448184, -86.36323899],
  [37.00457515, -86.36307953], [37.0047012, -86.36286956], [37.00486024, -86.36273924],
  [37.00505061, -86.36270756], [37.00527945, -86.36272947], [37.00548802, -86.36263566],
  [37.00565341, -86.36245496], [37.00573513, -86.3621647], [37.00568611, -86.36182869],
  [37.00548782, -86.36157939], [37.0052881, -86.36149696], [37.00511652, -86.36149669],
  [37.0049746, -86.36158761], [37.00485989, -86.3616726], [37.00469955, -86.3617696],
  [37.00451492, -86.36178471], [37.00435852, -86.36173599], [37.00419576, -86.36162316],
  [37.00409127, -86.36146652], [37.00404463, -86.3612301], [37.00407232, -86.36097832],
  [37.00415922, -86.36078578], [37.00426711, -86.36066944], [37.00439509, -86.36060407],
  [37.00452844, -86.36057503], [37.00466778, -86.36054604], [37.004833, -86.36050987],
  [37.00499495, -86.36047743], [37.00514229, -86.36044484], [37.00524902, -86.36041601],
  [37.00541074, -86.36037856], [37.00558676, -86.36034575], [37.00578957, -86.36038183],
  [37.00596102, -86.36045445], [37.00607154, -86.36065091], [37.0061651, -86.36090615],
  [37.00626234, -86.3611639], [37.00637312, -86.36147776], [37.00642557, -86.36179897],
  [37.00644459, -86.36216748], [37.00637929, -86.36250433], [37.00629836, -86.36273906],
  [37.00622229, -86.36291634], [37.00611158, -86.36309997], [37.00600738, -86.36323379],
  [37.00589169, -86.3633461], [37.00576471, -86.36344689], [37.00564905, -86.36353398],
  [37.00551878, -86.36359932], [37.00537978, -86.36365448], [37.00525188, -86.36370605],
  [37.0051236, -86.36376501], [37.00497727, -86.36382802], [37.00484855, -86.36391978],
  [37.00471266, -86.36403361], [37.0045783, -86.36422396], [37.00447907, -86.36439954],
  [37.00435695, -86.36453807], [37.00424813, -86.36465022], [37.00411061, -86.36480228],
  [37.00397977, -86.36492984], [37.0038682, -86.36504946], [37.00376295, -86.36516126],
  [37.00365436, -86.36527329], [37.00354759, -86.36539144], [37.00341675, -86.36552332],
  [37.00329206, -86.3656715], [37.00316095, -86.36581567], [37.00303256, -86.36594441],
  [37.00291203, -86.36607157], [37.00278014, -86.36622802], [37.00269333, -86.36641303],
  [37.00260606, -86.36659437], [37.00252845, -86.36675984], [37.00243487, -86.36695271],
  [37.00234795, -86.36716654], [37.00226102, -86.36735999], [37.00218046, -86.36754144],
  [37.00210026, -86.36771854], [37.00202358, -86.36787901], [37.00194406, -86.36806693],
  [37.00185835, -86.36825428], [37.00177578, -86.36843604], [37.00169902, -86.36860048],
  [37.0016732, -86.3687928], [37.001679, -86.3689974], [37.00168488, -86.36919051],
  [37.00169122, -86.36938766], [37.00169469, -86.3695562], [37.00170118, -86.36974238],
  [37.00171055, -86.36993991], [37.00167198, -86.37010864], [37.00158558, -86.37021273],
  [37.00148934, -86.37030898], [37.00139295, -86.37041757], [37.00129011, -86.37051816],
  [37.00120286, -86.37061913], [37.00112253, -86.37073184], [37.00106144, -86.37085264],
  [37.00099678, -86.37100197], [37.00092255, -86.37116696], [37.00083249, -86.37137665],
  [37.00073506, -86.37159438], [37.00065426, -86.37177611], [37.00057398, -86.37196168],
  [37.00060097, -86.37214635], [37.00074272, -86.37221467], [37.0009059, -86.37222018],
  [37.00107657, -86.37218846], [37.00122503, -86.37211976], [37.00133803, -86.37204677],
  [37.00145467, -86.37192099], [37.00156457, -86.37178347], [37.00167114, -86.37162599],
  [37.00176434, -86.37145299], [37.00183833, -86.37126821], [37.00188646, -86.37112396],
  [37.0019441, -86.37095574], [37.00197296, -86.370787], [37.00202945, -86.37067751],
  [37.00209668, -86.37048098], [37.00218305, -86.37031655], [37.00228558, -86.37016005],
  [37.00238818, -86.37002764], [37.00249377, -86.36991909], [37.00259639, -86.36983868],
  [37.00270864, -86.36976266], [37.00281411, -86.3697033], [37.00292264, -86.36964769],
  [37.00303847, -86.369599], [37.00316942, -86.36952703], [37.00332578, -86.36939126],
  [37.00342743, -86.36921198], [37.00346211, -86.36901195], [37.00343231, -86.36879509],
  [37.00336736, -86.36861758], [37.00327983, -86.36847602], [37.00316589, -86.36828932],
  [37.00305696, -86.36810259], [37.00296937, -86.36793662], [37.00293802, -86.36773416],
  [37.00295792, -86.36753614], [37.00301643, -86.36739089], [37.00307192, -86.36724611],
  [37.00312788, -86.36711056], [37.00320856, -86.36698638], [37.00331523, -86.36684361],
  [37.00340519, -86.36672019], [37.00350264, -86.36658791], [37.00361135, -86.36649982],
  [37.00374245, -86.36645177], [37.00387034, -86.3664758], [37.00395668, -86.36655587],
  [37.00402368, -86.36670753], [37.00407807, -86.36686779], [37.00412607, -86.36701603],
  [37.00418686, -86.36718831], [37.00427315, -86.36742386], [37.00436296, -86.3676927],
  [37.00442144, -86.36790543], [37.00445858, -86.36815496], [37.00447715, -86.36847342],
  [37.00444541, -86.36882644], [37.00434238, -86.36911386], [37.00425654, -86.36927291],
  [37.00418289, -86.36939303], [37.00410293, -86.36950912], [37.00399731, -86.36962489],
  [37.00390147, -86.36973254], [37.00379293, -86.36984054], [37.00369701, -86.36994104],
  [37.00359474, -86.37004514], [37.0034838, -86.3701598], [37.00338477, -86.37024376],
  [37.00327609, -86.37032788], [37.00318982, -86.37040789], [37.00306205, -86.37049992],
  [37.00294389, -86.37059192], [37.00283177, -86.37070006], [37.00272312, -86.37083897],
  [37.00264003, -86.37094293], [37.00255683, -86.37103895], [37.00249914, -86.37115127],
  [37.00243497, -86.37126771], [37.00236746, -86.3713964], [37.00230001, -86.37152106],
  [37.00223561, -86.37164596], [37.00217132, -86.37175865], [37.0021135, -86.37187932],
  [37.00204601, -86.37200003], [37.00196791, -86.37211434], [37.00188761, -86.3722312],
  [37.00180726, -86.37233202], [37.00173651, -86.37241676], [37.00165284, -86.37250555],
  [37.00155067, -86.3726109], [37.00144762, -86.37271211], [37.00136704, -86.37279282],
  [37.00126713, -86.37288565], [37.00115123, -86.37299929], [37.00103518, -86.37310829],
  [37.0009191, -86.37321738], [37.00082561, -86.37329809], [37.00072863, -86.37339546],
  [37.00061364, -86.37350099], [37.00051698, -86.37360214], [37.00042667, -86.37368311],
  [37.00032338, -86.37378434], [37.00022342, -86.37387665], [37.00012018, -86.3739737],
  [37.00002051, -86.37405916], [36.99991404, -86.37415222], [36.99981076, -86.37423248],
  [36.99970432, -86.37430523], [36.99958169, -86.37432571], [36.99946928, -86.37430399],
  [36.99934964, -86.37428072], [36.99922365, -86.37425686], [36.99908793, -86.37422888],
  [36.99899069, -86.37413638], [36.99896465, -86.37397888], [36.9989808, -86.37380904],
  [36.99900664, -86.37362303], [36.99904589, -86.37342887], [36.9990885, -86.37323096],
  [36.99912743, -86.3730292], [36.99916641, -86.37284378], [36.99921127, -86.37261758],
  [36.99924349, -86.37245211], [36.99932082, -86.37230251], [36.99940337, -86.37214797],
  [36.99948814, -86.37199725], [36.99958754, -86.37189043], [36.99970528, -86.37178738],
  [36.99982625, -86.37169183], [36.99997073, -86.37159181], [37.00011471, -86.3714889],
  [37.00027357, -86.37138907], [37.0003852, -86.37123775], [37.00042033, -86.37099884],
  [37.00038811, -86.3707825], [37.00031195, -86.37062837], [37.00026491, -86.37041498],
  [37.00030254, -86.37020247], [37.00038472, -86.3700261], [37.0004699, -86.36984594],
  [37.00056383, -86.36964375], [37.00064015, -86.3694857], [37.00070993, -86.36934481],
  [37.0008098, -86.36912411], [37.00090662, -86.36891836], [37.00098578, -86.36874579],
  [37.00107373, -86.36854755],
]

let wpIdx = 0
const simStartTime = Date.now()

// Dummy state for all signals
interface SimState {
  [field: string]: number
}

const ds: SimState = {
  TotalPackVoltage: 120, AcceleratorPosition: 0.3, BatteryCurrent: 50,
  BatteryVoltage: 115, CurrentSensor1: 4.2, CurrentSensor2: 3.8, MechBrakePressed: 0,
  PackCurrent: 48, VehicleVelocity: 15, VoltSensor1: 50, VoltSensor2: 49, VoltageofLeast: 3.8,
  PackPower: 5800, MotorPower: 5500,
  EnergyVOLExtrapolated: 2400, EnergyFromIntegratedPower: 2280,
  Efficiency1Hour: 280, Efficiency5Minute: 300, EfficiencyLap: 290,
  LapIndex: 4, TrackIndex: 0.45,
  TrackDistSpreadsheet: 2268,
  AirTemperature: 28, DHI: 80, DNI: 650, GHI: 700,
  PrecipitationRate: 0, WindDirection: 180, WindSpeed: 3.5, Zenith: 42,
  SteeringAngle: 0.0, SOC: 0.715,
}

function dummyTick() {
  const w = (v: number, s: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * s))
  // ingress
  ds.TotalPackVoltage    = w(ds.TotalPackVoltage, 0.5, 80, 160)
  ds.AcceleratorPosition = w(ds.AcceleratorPosition, 0.05, 0, 1)
  ds.BatteryCurrent      = w(ds.BatteryCurrent, 5, -50, 200)
  ds.BatteryVoltage      = w(ds.BatteryVoltage, 0.4, 0, 160)
  ds.CurrentSensor1      = w(ds.CurrentSensor1, 0.2, 0, 10)
  ds.CurrentSensor2      = w(ds.CurrentSensor2, 0.2, 0, 10)
  ds.MechBrakePressed    = Math.random() < 0.02 ? 1 : 0
  ds.PackCurrent         = w(ds.PackCurrent, 4, -50, 200)
  ds.VehicleVelocity     = w(ds.VehicleVelocity, 1, 0, 50)
  ds.VoltSensor1         = w(ds.VoltSensor1, 0.3, 0, 80)
  ds.VoltSensor2         = w(ds.VoltSensor2, 0.3, 0, 80)
  ds.VoltageofLeast      = w(ds.VoltageofLeast, 0.01, 2.5, 4.2)
  // power
  ds.PackPower           = ds.PackCurrent * ds.TotalPackVoltage
  ds.MotorPower          = ds.BatteryCurrent * ds.BatteryVoltage * (ds.BatteryCurrent < 0 ? -1 : 1)
  // energy
  ds.EnergyVOLExtrapolated     = w(ds.EnergyVOLExtrapolated, 5, 0, 5000)
  ds.EnergyFromIntegratedPower = w(ds.EnergyFromIntegratedPower, 5, 0, 5000)
  // efficiency
  ds.Efficiency1Hour     = w(ds.Efficiency1Hour, 5, 0, 800)
  ds.Efficiency5Minute   = w(ds.Efficiency5Minute, 8, 0, 800)
  ds.EfficiencyLap       = w(ds.EfficiencyLap, 6, 0, 800)
  // localization — lap advances every 4 min of real time, TrackIndex runs 0→1 within each lap
  const LAP_DURATION_MS = 4 * 60 * 1000
  const elapsedMs = Date.now() - simStartTime
  const completedLaps = Math.floor(elapsedMs / LAP_DURATION_MS)
  ds.LapIndex            = 4 + completedLaps // laps 4+ after seeded 1-3
  ds.TrackIndex          = (elapsedMs % LAP_DURATION_MS) / LAP_DURATION_MS
  ds.TrackDistSpreadsheet = ds.TrackIndex * 5040
  // weather
  ds.AirTemperature      = w(ds.AirTemperature, 0.05, -10, 45)
  ds.DHI                 = w(ds.DHI, 2, 0, 400)
  ds.DNI                 = w(ds.DNI, 5, 0, 1000)
  ds.GHI                 = w(ds.GHI, 5, 0, 1200)
  ds.PrecipitationRate   = w(ds.PrecipitationRate, 0.01, 0, 50)
  ds.WindDirection       = w(ds.WindDirection, 1, 0, 360)
  ds.WindSpeed           = w(ds.WindSpeed, 0.1, 0, 20)
  ds.Zenith              = w(ds.Zenith, 0.05, 0, 90)
  // SOC
  ds.SteeringAngle       = w(ds.SteeringAngle, 4, -180, 180)
  ds.SOC                 = w(ds.SOC, 0.0008, 0, 1)

  const pt = WAYPOINTS[wpIdx % WAYPOINTS.length]; wpIdx++
  const now = Date.now()
  pushGPS(now, pt[0], pt[1])
  const signals = getState().signals
  signals.forEach(sig => { if (ds[sig.field] !== undefined) push(sig.field, now, ds[sig.field]) })
}

let dummyTickInterval: ReturnType<typeof setInterval> | null = null

function startSim() {
  stopSim()
  dummyTickInterval = setInterval(dummyTick, 500)
}

function stopSim() {
  if (dummyTickInterval) { clearInterval(dummyTickInterval); dummyTickInterval = null }
}

// ── Seed 3 laps of historical data ──────────────────────────────────────────
function seedHistory() {
  const LAP_DURATION_MS = 4 * 60 * 1000 // 4 min per lap (simulated)
  const TICK_INTERVAL_MS = 2000         // one point every 2s
  const now = Date.now()
  const seed: SimState = {
    TotalPackVoltage: 122, AcceleratorPosition: 0.32, BatteryCurrent: 52,
    BatteryVoltage: 116, CurrentSensor1: 4.1, CurrentSensor2: 3.9, MechBrakePressed: 0,
    PackCurrent: 50, VehicleVelocity: 15.5, VoltSensor1: 51, VoltSensor2: 50, VoltageofLeast: 3.82,
    PackPower: 6100, MotorPower: 5700,
    EnergyVOLExtrapolated: 2500, EnergyFromIntegratedPower: 2400,
    Efficiency1Hour: 285, Efficiency5Minute: 305, EfficiencyLap: 295,
    LapIndex: 1, TrackIndex: 0.0,
    TrackDistSpreadsheet: 0,
    AirTemperature: 27.5, DHI: 78, DNI: 640, GHI: 695,
    PrecipitationRate: 0, WindDirection: 178, WindSpeed: 3.4, Zenith: 43,
    SteeringAngle: 0.0, SOC: 0.795,
  }
  const sw = (v: number, s: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * s))
  const totalTicks = Math.floor((3 * LAP_DURATION_MS) / TICK_INTERVAL_MS)
  let wpSeed = 0
  const signals = getState().signals

  for (let tick = 0; tick < totalTicks; tick++) {
    const t = now - (totalTicks - tick) * TICK_INTERVAL_MS
    const lapProgress = (tick % (LAP_DURATION_MS / TICK_INTERVAL_MS)) / (LAP_DURATION_MS / TICK_INTERVAL_MS)
    const lapNum = 1 + Math.floor(tick / (LAP_DURATION_MS / TICK_INTERVAL_MS))

    seed.TotalPackVoltage    = sw(seed.TotalPackVoltage, 0.4, 80, 160)
    seed.AcceleratorPosition = sw(seed.AcceleratorPosition, 0.04, 0, 1)
    seed.BatteryCurrent      = sw(seed.BatteryCurrent, 4, -50, 200)
    seed.BatteryVoltage      = sw(seed.BatteryVoltage, 0.3, 0, 160)
    seed.CurrentSensor1      = sw(seed.CurrentSensor1, 0.15, 0, 10)
    seed.CurrentSensor2      = sw(seed.CurrentSensor2, 0.15, 0, 10)
    seed.MechBrakePressed    = Math.random() < 0.02 ? 1 : 0
    seed.PackCurrent         = sw(seed.PackCurrent, 3, -50, 200)
    seed.VehicleVelocity     = sw(seed.VehicleVelocity, 0.8, 0, 50)
    seed.VoltSensor1         = sw(seed.VoltSensor1, 0.25, 0, 80)
    seed.VoltSensor2         = sw(seed.VoltSensor2, 0.25, 0, 80)
    seed.VoltageofLeast      = sw(seed.VoltageofLeast, 0.008, 2.5, 4.2)
    seed.PackPower           = seed.PackCurrent * seed.TotalPackVoltage
    seed.MotorPower          = seed.BatteryCurrent * seed.BatteryVoltage * (seed.BatteryCurrent < 0 ? -1 : 1)
    seed.EnergyVOLExtrapolated     = sw(seed.EnergyVOLExtrapolated, 4, 0, 5000)
    seed.EnergyFromIntegratedPower = sw(seed.EnergyFromIntegratedPower, 4, 0, 5000)
    seed.Efficiency1Hour     = sw(seed.Efficiency1Hour, 4, 0, 800)
    seed.Efficiency5Minute   = sw(seed.Efficiency5Minute, 7, 0, 800)
    seed.EfficiencyLap       = sw(seed.EfficiencyLap, 5, 0, 800)
    seed.LapIndex            = lapNum
    seed.TrackIndex          = lapProgress
    seed.TrackDistSpreadsheet = lapProgress * 5040
    seed.AirTemperature      = sw(seed.AirTemperature, 0.04, -10, 45)
    seed.DHI                 = sw(seed.DHI, 1.5, 0, 400)
    seed.DNI                 = sw(seed.DNI, 4, 0, 1000)
    seed.GHI                 = sw(seed.GHI, 4, 0, 1200)
    seed.PrecipitationRate   = sw(seed.PrecipitationRate, 0.005, 0, 50)
    seed.WindDirection       = sw(seed.WindDirection, 0.8, 0, 360)
    seed.WindSpeed           = sw(seed.WindSpeed, 0.08, 0, 20)
    seed.Zenith              = sw(seed.Zenith, 0.04, 0, 90)
    seed.SteeringAngle       = sw(seed.SteeringAngle, 4, -180, 180)
    seed.SOC                 = sw(seed.SOC, 0.0008, 0, 1)

    signals.forEach(sig => {
      if (seed[sig.field] !== undefined) {
        const v = sig.transform ? sig.transform(seed[sig.field]) : seed[sig.field]
        pushRawPoint(sig.field, t, v)
      }
    })
    const wp = WAYPOINTS[wpSeed % WAYPOINTS.length]; wpSeed++
    pushRawGps(t, wp[0], wp[1])
  }
  notifyNow()
}

// StrictMode-safe: only seeds once per session regardless of double-invoked effects.
let seeded = false

function ensureSeeded() {
  if (seeded) return
  seedHistory()
  seeded = true
}

export { dummyTick, ensureSeeded, seedHistory, startSim, stopSim }
