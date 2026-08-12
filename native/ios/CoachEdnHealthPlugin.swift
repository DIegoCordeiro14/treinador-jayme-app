import Foundation
import Capacitor

/**
 * Ponte Capacitor iOS. Histórico + rota via HealthKit; FC ao vivo via
 * HKLiveWorkoutBuilder (Apple Watch, encaminhado por WatchConnectivity).
 * Retorna o contrato normalizado de src/native/health/definitions.ts.
 */
@objc(CoachEdnHealthPlugin)
public class CoachEdnHealthPlugin: CAPPlugin {
  private lazy var reader = HealthKitReader()
  private lazy var live = LiveWorkoutManager { [weak self] event in
    self?.notifyListeners("liveMetrics", data: event)
  }

  @objc func isAvailable(_ call: CAPPluginCall) {
    call.resolve(["available": reader.isAvailable(), "platform": "ios"])
  }

  @objc func getHealthPermissionsStatus(_ call: CAPPluginCall) {
    reader.permissionStatus { status in call.resolve(status) }
  }

  @objc func requestHealthPermissions(_ call: CAPPluginCall) {
    reader.requestPermissions { status in call.resolve(status) }
  }

  @objc func queryWorkouts(_ call: CAPPluginCall) {
    guard let start = call.getString("startTime"), let end = call.getString("endTime") else { return call.reject("missing range") }
    reader.queryWorkouts(start: start, end: end) { workouts in
      call.resolve(["workouts": workouts])
    }
  }

  @objc func queryWorkoutDetails(_ call: CAPPluginCall) {
    guard let id = call.getString("externalId"), let start = call.getString("startTime"), let end = call.getString("endTime") else { return call.reject("missing") }
    reader.queryWorkoutDetails(externalId: id, start: start, end: end) { details in call.resolve(details) }
  }

  @objc func queryHeartRateSamples(_ call: CAPPluginCall) {
    guard let start = call.getString("startTime"), let end = call.getString("endTime") else { return call.reject("missing") }
    reader.readHeartRate(start: start, end: end) { samples in call.resolve(["samples": samples]) }
  }

  @objc func queryWorkoutRoute(_ call: CAPPluginCall) {
    guard let id = call.getString("externalId"), let start = call.getString("startTime"), let end = call.getString("endTime") else { return call.reject("missing") }
    reader.readRoute(externalId: id, start: start, end: end) { route in call.resolve(["route": route]) }
  }

  @objc func startLiveMetrics(_ call: CAPPluginCall) { live.start(sportType: call.getString("sportType")); call.resolve() }
  @objc func stopLiveMetrics(_ call: CAPPluginCall) { live.stop(); call.resolve() }
}
