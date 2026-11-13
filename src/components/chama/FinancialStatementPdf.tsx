import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatMinorUnits } from "@/lib/finance/money";

export type FinancialStatementEntry = {
  id: string;
  type: string;
  status: string;
  direction: string;
  amountMinor: number | null;
  legacyAmountMajor?: number | null;
  currency: string;
  memberName: string;
  reference: string;
  method: string;
  transactionDate: string;
  description: string;
};

const styles = StyleSheet.create({
  page: { padding: 34, fontSize: 9, color: "#172033", fontFamily: "Helvetica" },
  title: { fontSize: 19, fontWeight: 700, color: "#11213e", marginBottom: 6 },
  subtitle: { color: "#53647f", marginBottom: 18 },
  meta: { display: "flex", flexDirection: "row", gap: 20, marginBottom: 16, padding: 10, backgroundColor: "#f1f5fb" },
  label: { color: "#64748b", fontSize: 8, marginBottom: 3 },
  value: { fontSize: 9, fontWeight: 700 },
  notice: { padding: 9, backgroundColor: "#fff8e6", color: "#805814", marginBottom: 14 },
  header: { display: "flex", flexDirection: "row", padding: 7, backgroundColor: "#e9eef6", fontWeight: 700 },
  row: { display: "flex", flexDirection: "row", borderBottom: "1 solid #e4e9f1", paddingVertical: 7 },
  date: { width: "13%" },
  type: { width: "16%" },
  member: { width: "19%" },
  detail: { width: "25%" },
  status: { width: "14%" },
  amount: { width: "13%", textAlign: "right" },
  footer: { position: "absolute", bottom: 18, left: 34, right: 34, color: "#76849a", fontSize: 7 },
});

type Props = {
  groupName: string;
  groupId: string;
  statementReference: string;
  periodLabel: string;
  generatedAt: string;
  entries: FinancialStatementEntry[];
  reconciliationStatus: string;
};

export default function FinancialStatementPdf(props: Props) {
  return (
    <Document title={`${props.groupName} financial statement`} author="ChamaHub">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>Financial activity statement</Text>
        <Text style={styles.subtitle}>{props.groupName} · ChamaHub</Text>
        <View style={styles.meta}>
          <View><Text style={styles.label}>Reporting period</Text><Text style={styles.value}>{props.periodLabel}</Text></View>
          <View><Text style={styles.label}>Statement reference</Text><Text style={styles.value}>{props.statementReference}</Text></View>
          <View><Text style={styles.label}>Transactions</Text><Text style={styles.value}>{props.entries.length}</Text></View>
        </View>
        <Text style={styles.notice}>
          Recorded activity is shown by verification status. This statement does not assert available cash.
          Reconciliation status: {props.reconciliationStatus}.
        </Text>
        <View style={styles.header} fixed>
          <Text style={styles.date}>Date</Text>
          <Text style={styles.type}>Type</Text>
          <Text style={styles.member}>Member</Text>
          <Text style={styles.detail}>Method / reference</Text>
          <Text style={styles.status}>Status</Text>
          <Text style={styles.amount}>Amount</Text>
        </View>
        {props.entries.map((entry) => (
          <View style={styles.row} key={entry.id} wrap={false}>
            <Text style={styles.date}>{new Date(entry.transactionDate).toLocaleDateString("en-KE")}</Text>
            <Text style={styles.type}>{entry.type}</Text>
            <Text style={styles.member}>{entry.memberName}</Text>
            <Text style={styles.detail}>{[entry.method, entry.reference, entry.description].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.status}>{entry.status.replaceAll("_", " ")}</Text>
            <Text style={styles.amount}>
              {entry.amountMinor != null
                ? `${formatMinorUnits(entry.amountMinor, entry.currency)}${entry.status === "legacy_unverified" ? "*" : ""}`
                : entry.legacyAmountMajor != null
                  ? `${entry.currency} ${entry.legacyAmountMajor}*`
                  : "Amount unknown"}
            </Text>
          </View>
        ))}
        {props.entries.length === 0 && <Text>No transactions match this statement period.</Text>}
        <Text style={styles.footer} fixed>
          Generated {props.generatedAt} · Group {props.groupId} · Legacy amounts marked * require treasury review.
        </Text>
      </Page>
    </Document>
  );
}
