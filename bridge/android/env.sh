#!/usr/bin/env bash
# Source before building / deploying the demo:
#   source bridge/android/env.sh
#
# Installs nothing — only exports paths for .NET 9, OpenJDK 17, and Android SDK.

export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Helpful checks (quiet if tools missing)
command -v dotnet >/dev/null && echo "dotnet: $(dotnet --version)"
command -v java >/dev/null && java -version 2>&1 | head -1
command -v adb >/dev/null && echo "adb: $(adb version 2>&1 | head -1)"
echo "ANDROID_HOME=$ANDROID_HOME"
echo "JAVA_HOME=$JAVA_HOME"
