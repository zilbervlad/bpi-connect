import { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { requestApiPasswordReset } from "../api/client";

export function LoginScreen({ onLogin, errorMessage, isLoading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  function handleLogin() {
    onLogin(email.trim(), password);
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setResetMessage("Enter your email first, then tap Forgot Password.");
      return;
    }

    setIsResetting(true);
    setResetMessage("");

    try {
      const result = await requestApiPasswordReset(email.trim());
      setResetMessage(result.message || "If that email exists, a reset link has been sent.");
    } catch (error) {
      setResetMessage(error.message || "Could not request password reset.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <SafeAreaView style={localStyles.safe}>
      <StatusBar style="light" />

      <View style={localStyles.container}>
        <View style={localStyles.logo}>
          <Text style={localStyles.logoText}>BPI</Text>
        </View>

        <Text style={localStyles.title}>BPI Connect</Text>
        <Text style={localStyles.subtitle}>
          Sign in to messages, store groups, announcements, and team updates.
        </Text>

        <View style={localStyles.card}>
          <Text style={localStyles.cardTitle}>Welcome back</Text>

          <Text style={localStyles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@bostonpie.com"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <Text style={localStyles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <TouchableOpacity
            style={localStyles.forgotButton}
            onPress={handleForgotPassword}
            disabled={isResetting}
          >
            <Text style={localStyles.forgotButtonText}>
              {isResetting ? "Sending reset..." : "Forgot Password?"}
            </Text>
          </TouchableOpacity>

          {resetMessage ? (
            <View style={localStyles.resetBox}>
              <Text style={localStyles.resetText}>{resetMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={localStyles.errorBox}>
              <Text style={localStyles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[localStyles.loginButton, isLoading && localStyles.disabledButton]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={localStyles.loginButtonText}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Text>
          </TouchableOpacity>

          <Text style={localStyles.note}>
            Accounts are invite-only. See your manager, HR, or admin if you need access.
          </Text>
        </View>

        <Text style={localStyles.footer}>Boston Pie, Inc.</Text>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  logo: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  title: {
    color: "#ffffff",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -2,
    marginBottom: 10,
  },
  subtitle: {
    color: "#b9c7d8",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 22,
  },
  cardTitle: {
    color: "#10212b",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 18,
  },
  label: {
    color: "#526273",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#10212b",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  forgotButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: -4,
    marginBottom: 10,
  },
  forgotButtonText: {
    color: "#e91f3f",
    fontSize: 14,
    fontWeight: "900",
  },
  resetBox: {
    backgroundColor: "#eef5f8",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  resetText: {
    color: "#526273",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#ffe4e8",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#991b2f",
    fontSize: 13,
    fontWeight: "800",
  },
  loginButton: {
    backgroundColor: "#e91f3f",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  disabledButton: {
    opacity: 0.55,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  note: {
    color: "#697b8d",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 16,
    fontWeight: "700",
  },
  footer: {
    color: "#718399",
    textAlign: "center",
    marginTop: 26,
    fontWeight: "700",
  },
});
