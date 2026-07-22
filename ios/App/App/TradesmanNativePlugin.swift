import Foundation
import Capacitor
import AVFoundation

/**
 * Native helpers for FCM readiness (stub) + softphone speaker / earpiece routing.
 */
@objc(TradesmanNativePlugin)
public class TradesmanNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TradesmanNativePlugin"
    public let jsName = "TradesmanNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getFcmAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetCallAudio", returnType: CAPPluginReturnPromise),
    ]

    @objc func getFcmAvailability(_ call: CAPPluginCall) {
        // iOS push uses APNs via Capacitor Push; treat as available when running natively.
        call.resolve(["available": true])
    }

    @objc func setSpeakerOn(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func resetCallAudio(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.overrideOutputAudioPort(.none)
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }
}
