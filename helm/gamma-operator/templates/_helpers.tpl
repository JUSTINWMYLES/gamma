{{/*
helm/gamma-operator/templates/_helpers.tpl
Common template helpers.
*/}}

{{- define "gamma-operator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "gamma-operator.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "gamma-operator.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "gamma-operator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "gamma-operator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "gamma-operator.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "gamma-operator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
