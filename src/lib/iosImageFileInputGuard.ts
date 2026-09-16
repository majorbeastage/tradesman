/**
 * Previously intercepted image file-input taps and routed them through
 * TradesmanNative.pickImage. That plugin method is not registered on iOS, so
 * My T showed a fake in-app sheet then "not implemented".
 *
 * iOS WKWebView already presents the system Take Photo / Photo Library sheet
 * for `<input type="file" accept="image/*">`. Info.plist has
 * NSCameraUsageDescription, so that system sheet is safe.
 */
export function installIosImageFileInputGuard(): void {
  return
}
