import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { styles } from "../styles/styles";
import {
  cancelApiOpsRequest,
  createApiAvailabilityRequest,
  createApiTimeOffRequest,
  fetchApiOpsRequests,
  fetchApiUserDetail,
  reviewApiOpsRequest,
} from "../api/client";

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
];

export function AvailabilityScreen({ user, onBack }) {
  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  const canReview = [
    "admin",
    "hr",
    "coach",
    "supervisor",
    "general_manager",
    "manager",
    "mit",
  ].includes(normalizedRole);

  const [activeView, setActiveView] = useState("mine");
  const [requestType, setRequestType] = useState("time_off");

  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userDetail, setUserDetail] = useState(null);

  const [selectedStoreId, setSelectedStoreId] = useState(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [effectiveDate, setEffectiveDate] = useState("");
  const [employeeNote, setEmployeeNote] = useState("");
  const [availability, setAvailability] = useState({
    monday: "",
    tuesday: "",
    wednesday: "",
    thursday: "",
    friday: "",
    saturday: "",
    sunday: "",
  });

  const [managerNotes, setManagerNotes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const assignedStores = useMemo(() => {
    const rows = [];

    if (userDetail?.store) {
      rows.push({
        id: userDetail.store.id,
        store_number: userDetail.store.store_number,
        name: userDetail.store.name,
        assignment_type: "primary",
      });
    }

    for (const assignment of userDetail?.store_assignments || []) {
      const store = assignment.store;

      if (!store?.id || rows.some((item) => item.id === store.id)) {
        continue;
      }

      rows.push({
        id: store.id,
        store_number: store.store_number,
        name: store.name,
        assignment_type: assignment.assignment_type,
      });
    }

    return rows;
  }, [userDetail]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadRequests(activeView);
  }, [activeView]);

  useEffect(() => {
    if (!selectedStoreId && assignedStores.length) {
      setSelectedStoreId(assignedStores[0].id);
    }
  }, [assignedStores, selectedStoreId]);

  async function loadInitialData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const detail = await fetchApiUserDetail(user.id, user.id);
      setUserDetail(detail);
      await loadRequests("mine");
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to load availability tools."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRequests(scope = activeView) {
    try {
      const result = await fetchApiOpsRequests(
        user.id,
        scope,
        scope === "manage" ? "pending" : ""
      );

      setRequests(result.requests);
      setPendingCount(result.pendingCount);
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to load requests."
      );
    }
  }

  async function submitTimeOff() {
    if (!selectedStoreId || !startDate.trim()) {
      Alert.alert(
        "Missing information",
        "Choose a store and enter a start date."
      );
      return;
    }

    setIsSaving(true);

    try {
      await createApiTimeOffRequest({
        userId: user.id,
        storeId: selectedStoreId,
        startDate: startDate.trim(),
        endDate: endDate.trim() || startDate.trim(),
        allDay: true,
        reason: reason.trim(),
      });

      setStartDate("");
      setEndDate("");
      setReason("");

      await loadRequests("mine");
      setActiveView("mine");

      Alert.alert(
        "Request submitted",
        "Your time-off request is pending review."
      );
    } catch (error) {
      Alert.alert(
        "Unable to submit",
        error?.message || "Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAvailability() {
    if (!selectedStoreId || !effectiveDate.trim()) {
      Alert.alert(
        "Missing information",
        "Choose a store and enter an effective date."
      );
      return;
    }

    if (!Object.values(availability).some((value) => value.trim())) {
      Alert.alert(
        "Missing availability",
        "Enter availability for at least one day."
      );
      return;
    }

    setIsSaving(true);

    try {
      await createApiAvailabilityRequest({
        userId: user.id,
        storeId: selectedStoreId,
        effectiveDate: effectiveDate.trim(),
        availability,
        employeeNote: employeeNote.trim(),
      });

      setEffectiveDate("");
      setEmployeeNote("");
      setAvailability({
        monday: "",
        tuesday: "",
        wednesday: "",
        thursday: "",
        friday: "",
        saturday: "",
        sunday: "",
      });

      await loadRequests("mine");
      setActiveView("mine");

      Alert.alert(
        "Request submitted",
        "Your availability change is pending review."
      );
    } catch (error) {
      Alert.alert(
        "Unable to submit",
        error?.message || "Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReview(item, decision) {
    try {
      await reviewApiOpsRequest({
        requestType: item.request_type,
        requestId: item.id,
        actorUserId: user.id,
        decision,
        managerNote: managerNotes[itemKey(item)] || "",
      });

      await loadRequests("manage");

      Alert.alert(
        decision === "approved" ? "Approved" : "Denied",
        `${requestLabel(item)} has been ${decision}.`
      );
    } catch (error) {
      Alert.alert(
        "Unable to review",
        error?.message || "Please try again."
      );
    }
  }

  async function handleCancel(item) {
    try {
      await cancelApiOpsRequest({
        requestType: item.request_type,
        requestId: item.id,
        userId: user.id,
      });

      await loadRequests("mine");
    } catch (error) {
      Alert.alert(
        "Unable to cancel",
        error?.message || "Please try again."
      );
    }
  }

  if (isLoading) {
    return (
      <View style={localStyles.loadingWrap}>
        <ActivityIndicator size="large" />
        <Text style={localStyles.loadingText}>
          Loading requests...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={localStyles.content}
    >
      <TouchableOpacity onPress={onBack}>
        <Text style={localStyles.back}>‹ Back to Ops</Text>
      </TouchableOpacity>

      <Text style={localStyles.eyebrow}>OPS</Text>
      <Text style={localStyles.title}>
        Availability & Time Off
      </Text>
      <Text style={localStyles.subtitle}>
        Submit requests and track manager decisions.
      </Text>

      {errorMessage ? (
        <Text style={localStyles.error}>{errorMessage}</Text>
      ) : null}

      <View style={localStyles.tabs}>
        <TabButton
          label="My Requests"
          active={activeView === "mine"}
          onPress={() => setActiveView("mine")}
        />

        <TabButton
          label="New Request"
          active={activeView === "new"}
          onPress={() => setActiveView("new")}
        />

        {canReview ? (
          <TabButton
            label={`Approvals${pendingCount ? ` (${pendingCount})` : ""}`}
            active={activeView === "manage"}
            onPress={() => setActiveView("manage")}
          />
        ) : null}
      </View>

      {activeView === "new" ? (
        <>
          <View style={localStyles.typeRow}>
            <TabButton
              label="Time Off"
              active={requestType === "time_off"}
              onPress={() => setRequestType("time_off")}
            />
            <TabButton
              label="Availability"
              active={requestType === "availability"}
              onPress={() => setRequestType("availability")}
            />
          </View>

          <View style={localStyles.card}>
            <Text style={localStyles.sectionTitle}>Store</Text>

            <View style={localStyles.storeGrid}>
              {assignedStores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={[
                    localStyles.storePill,
                    selectedStoreId === store.id &&
                      localStyles.storePillActive,
                  ]}
                  onPress={() => setSelectedStoreId(store.id)}
                >
                  <Text
                    style={[
                      localStyles.storePillText,
                      selectedStoreId === store.id &&
                        localStyles.storePillTextActive,
                    ]}
                  >
                    {store.store_number}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!assignedStores.length ? (
              <Text style={localStyles.empty}>
                No store assignments were found.
              </Text>
            ) : null}
          </View>

          {requestType === "time_off" ? (
            <View style={localStyles.card}>
              <Text style={localStyles.sectionTitle}>
                Time-Off Request
              </Text>

              <FieldLabel text="Start date" />
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8191a1"
                style={localStyles.input}
              />

              <FieldLabel text="End date" />
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8191a1"
                style={localStyles.input}
              />

              <FieldLabel text="Reason or note" />
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Optional"
                placeholderTextColor="#8191a1"
                multiline
                style={[localStyles.input, localStyles.textArea]}
              />

              <PrimaryButton
                label={isSaving ? "Submitting..." : "Submit Time Off"}
                onPress={submitTimeOff}
                disabled={isSaving}
              />
            </View>
          ) : (
            <View style={localStyles.card}>
              <Text style={localStyles.sectionTitle}>
                Availability Change
              </Text>

              <FieldLabel text="Effective date" />
              <TextInput
                value={effectiveDate}
                onChangeText={setEffectiveDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8191a1"
                style={localStyles.input}
              />

              {DAYS.map(([key, label]) => (
                <View key={key}>
                  <FieldLabel text={label} />
                  <TextInput
                    value={availability[key]}
                    onChangeText={(value) =>
                      setAvailability((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    placeholder="Example: 4 PM–Close or Unavailable"
                    placeholderTextColor="#8191a1"
                    style={localStyles.input}
                  />
                </View>
              ))}

              <FieldLabel text="Note" />
              <TextInput
                value={employeeNote}
                onChangeText={setEmployeeNote}
                placeholder="Optional explanation"
                placeholderTextColor="#8191a1"
                multiline
                style={[localStyles.input, localStyles.textArea]}
              />

              <PrimaryButton
                label={isSaving ? "Submitting..." : "Submit Availability"}
                onPress={submitAvailability}
                disabled={isSaving}
              />
            </View>
          )}
        </>
      ) : (
        <View style={localStyles.list}>
          {requests.length ? (
            requests.map((item) => (
              <RequestCard
                key={itemKey(item)}
                item={item}
                managerNote={managerNotes[itemKey(item)] || ""}
                onManagerNoteChange={(value) =>
                  setManagerNotes((current) => ({
                    ...current,
                    [itemKey(item)]: value,
                  }))
                }
                canReview={activeView === "manage"}
                canCancel={
                  activeView === "mine" &&
                  item.status === "pending"
                }
                onApprove={() => handleReview(item, "approved")}
                onDeny={() => handleReview(item, "denied")}
                onCancel={() => handleCancel(item)}
              />
            ))
          ) : (
            <View style={localStyles.card}>
              <Text style={localStyles.empty}>
                {activeView === "manage"
                  ? "No pending requests."
                  : "You have not submitted any requests yet."}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function RequestCard({
  item,
  managerNote,
  onManagerNoteChange,
  canReview,
  canCancel,
  onApprove,
  onDeny,
  onCancel,
}) {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.rowBetween}>
        <View style={localStyles.requestMain}>
          <Text style={localStyles.requestType}>
            {requestLabel(item)}
          </Text>
          <Text style={localStyles.requestUser}>
            {item.user?.name || "Team member"}
          </Text>
          <Text style={localStyles.requestMeta}>
            Store {item.store?.store_number || "—"}
          </Text>
        </View>

        <StatusBadge status={item.status} />
      </View>

      {item.request_type === "time_off" ? (
        <>
          <Text style={localStyles.requestDetail}>
            {item.start_date}
            {item.end_date && item.end_date !== item.start_date
              ? ` through ${item.end_date}`
              : ""}
          </Text>

          {item.reason ? (
            <Text style={localStyles.note}>{item.reason}</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={localStyles.requestDetail}>
            Effective {item.effective_date}
          </Text>

          {DAYS.map(([key, label]) =>
            item.availability?.[key] ? (
              <Text key={key} style={localStyles.dayLine}>
                {label}: {item.availability[key]}
              </Text>
            ) : null
          )}

          {item.employee_note ? (
            <Text style={localStyles.note}>
              {item.employee_note}
            </Text>
          ) : null}
        </>
      )}

      {item.manager_note ? (
        <Text style={localStyles.managerNote}>
          Manager note: {item.manager_note}
        </Text>
      ) : null}

      {canReview ? (
        <>
          <TextInput
            value={managerNote}
            onChangeText={onManagerNoteChange}
            placeholder="Manager note"
            placeholderTextColor="#8191a1"
            style={localStyles.input}
          />

          <View style={localStyles.actionRow}>
            <TouchableOpacity
              style={localStyles.approveButton}
              onPress={onApprove}
            >
              <Text style={localStyles.approveText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={localStyles.denyButton}
              onPress={onDeny}
            >
              <Text style={localStyles.denyText}>Deny</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {canCancel ? (
        <TouchableOpacity
          style={localStyles.cancelButton}
          onPress={onCancel}
        >
          <Text style={localStyles.cancelText}>
            Cancel Request
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function TabButton({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[
        localStyles.tabButton,
        active && localStyles.tabButtonActive,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          localStyles.tabButtonText,
          active && localStyles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FieldLabel({ text }) {
  return <Text style={localStyles.fieldLabel}>{text}</Text>;
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[
        localStyles.primaryButton,
        disabled && localStyles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={localStyles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusBadge({ status }) {
  return (
    <Text
      style={[
        localStyles.status,
        status === "approved" && localStyles.statusApproved,
        status === "denied" && localStyles.statusDenied,
        status === "cancelled" && localStyles.statusCancelled,
      ]}
    >
      {String(status || "pending").toUpperCase()}
    </Text>
  );
}

function requestLabel(item) {
  return item.request_type === "availability"
    ? "Availability Change"
    : "Time Off";
}

function itemKey(item) {
  return `${item.request_type}-${item.id}`;
}

const localStyles = StyleSheet.create({
  content: {
    padding: 12,
    paddingBottom: 110,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#617386",
    fontWeight: "700",
  },
  back: {
    color: "#e91f3f",
    fontWeight: "900",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#10212b",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: "#687a8c",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 14,
  },
  error: {
    color: "#b42318",
    backgroundColor: "#fff1f0",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: "#e8eef3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: "#e91f3f",
  },
  tabButtonText: {
    color: "#526476",
    fontSize: 12,
    fontWeight: "900",
  },
  tabButtonTextActive: {
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e4eaf0",
  },
  sectionTitle: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 10,
  },
  fieldLabel: {
    color: "#526476",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 5,
    marginTop: 7,
  },
  input: {
    backgroundColor: "#f3f6f8",
    borderWidth: 1,
    borderColor: "#dce4eb",
    borderRadius: 13,
    minHeight: 44,
    paddingHorizontal: 12,
    color: "#10212b",
    fontWeight: "700",
  },
  textArea: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  storeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  storePill: {
    borderRadius: 12,
    backgroundColor: "#e8eef3",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  storePillActive: {
    backgroundColor: "#101d2d",
  },
  storePillText: {
    color: "#526476",
    fontWeight: "900",
  },
  storePillTextActive: {
    color: "#ffffff",
  },
  primaryButton: {
    backgroundColor: "#e91f3f",
    borderRadius: 14,
    minHeight: 47,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.55,
  },
  list: {
    gap: 1,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  requestMain: {
    flex: 1,
  },
  requestType: {
    color: "#10212b",
    fontSize: 16,
    fontWeight: "900",
  },
  requestUser: {
    color: "#526476",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  requestMeta: {
    color: "#8191a1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  requestDetail: {
    color: "#10212b",
    fontWeight: "800",
    marginTop: 12,
  },
  note: {
    color: "#526476",
    lineHeight: 18,
    marginTop: 8,
  },
  dayLine: {
    color: "#526476",
    lineHeight: 19,
    marginTop: 4,
  },
  managerNote: {
    backgroundColor: "#f3f6f8",
    color: "#526476",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    fontWeight: "700",
  },
  status: {
    color: "#a15c00",
    backgroundColor: "#fff2cc",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    fontSize: 9,
    fontWeight: "900",
  },
  statusApproved: {
    color: "#067647",
    backgroundColor: "#dcfae6",
  },
  statusDenied: {
    color: "#b42318",
    backgroundColor: "#fee4e2",
  },
  statusCancelled: {
    color: "#526476",
    backgroundColor: "#e8eef3",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  approveButton: {
    flex: 1,
    backgroundColor: "#067647",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  approveText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  denyButton: {
    flex: 1,
    backgroundColor: "#fee4e2",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  denyText: {
    color: "#b42318",
    fontWeight: "900",
  },
  cancelButton: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 9,
  },
  cancelText: {
    color: "#b42318",
    fontWeight: "900",
  },
  empty: {
    color: "#687a8c",
    textAlign: "center",
    fontWeight: "700",
  },
});
