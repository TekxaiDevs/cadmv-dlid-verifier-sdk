# Android / .NET setup (macOS)

Already applied on this machine (if you followed the install in-repo):

| Component | Location / version |
|-----------|--------------------|
| .NET SDK 8 | `~/.dotnet` (`8.0.426`) |
| Android workload | `dotnet workload list` → `android 34.0.43` |
| OpenJDK 17 | Homebrew `openjdk@17` |
| Android SDK | `~/Library/Android/sdk` |
| System image | `android-34;google_apis;arm64-v8a` |
| AVD | `Cadmv_API34_arm64` |

## Every new terminal

```sh
source bridge/android/env.sh
# or open a new shell — ~/.zshrc already has the exports
```

## Build

```sh
source bridge/android/env.sh
cd bridge/android/Cadmv.DlidVerifier.Demo
dotnet build -c Debug
```

## Run on emulator

```sh
# Terminal A — start emulator (wait until home screen)
source bridge/android/env.sh
emulator -avd Cadmv_API34_arm64

# Terminal B — deploy after emulator is up
source bridge/android/env.sh
cd bridge/android/Cadmv.DlidVerifier.Demo
adb wait-for-device
dotnet build -t:Install -c Debug
adb shell am start -n gov.ca.dmv.dlidverifier.demo/crc64$(adb shell pm path gov.ca.dmv.dlidverifier.demo >/dev/null)
# Simpler: use the helper
../run-emulator-demo.sh
```

Or use Visual Studio 2022 / VS Code with C# Dev Kit once the workload is installed.

## Fresh machine install (no sudo)

```sh
# .NET 8 (user install)
curl -fsSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 8.0 --install-dir "$HOME/.dotnet"

# JDK (Homebrew)
brew install openjdk@17

# Android workload
export PATH="$HOME/.dotnet:$PATH"
dotnet workload install android

# System image + AVD (needs Android SDK already present)
sdkmanager "system-images;android-34;google_apis;arm64-v8a"
avdmanager create avd -n Cadmv_API34_arm64 \
  -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_6
```

Homebrew’s `dotnet-sdk` **cask** needs an admin password; the script above avoids that.
