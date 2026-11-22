import io
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive headless backend
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np

from backend.services.dsp_service import dsp_service
from backend.core.logger import get_logger

logger = get_logger(__name__)


class PDFReportService:
    """
    Generates downloadable clinical and research EEG PDF reports
    with multi-panel waveforms, Welch PSD curves, bandpowers, event markers,
    quality diagnostics, and ethical disclaimers.
    """

    @staticmethod
    def generate_session_pdf(
        session: Dict[str, Any],
        participant: Optional[Dict[str, Any]],
        samples: List[float],
        fs: float = 256.0,
        events: Optional[List[Dict[str, Any]]] = None,
        notes: Optional[str] = None
    ) -> bytes:
        pdf_buffer = io.BytesIO()

        session_code = session.get("session_code", "UNKNOWN")
        part_code = participant.get("participant_code") if participant else session.get("participant_id", "P-UNKNOWN")
        operator = session.get("created_by", "Clinician")
        protocol = session.get("protocol_name", "Single Channel BioAmp Acquisition")
        date_str = session.get("started_at") or session.get("created_at") or datetime.now(timezone.utc).isoformat()
        if isinstance(date_str, datetime):
            date_str = date_str.strftime("%Y-%m-%d %H:%M:%S UTC")
        else:
            date_str = str(date_str)[:19].replace("T", " ")

        n_samples = len(samples)
        duration_sec = n_samples / fs if fs > 0 else 0.0
        dur_min = int(duration_sec // 60)
        dur_sec = int(duration_sec % 60)
        dur_str = f"{dur_min:02d}:{dur_sec:02d} ({duration_sec:.1f}s)"

        # Compute DSP bandpowers and quality metrics
        band_analysis = dsp_service.compute_bandpowers(samples, fs=fs) if n_samples >= 32 else dsp_service._empty_bandpower_response()
        quality = dsp_service.evaluate_signal_quality(samples, fs=fs) if n_samples >= 10 else {
            "overall_quality": "UNASSESSED",
            "score": 0,
            "metrics": {"flatline": False, "clipping": False, "baseline_drift": False, "high_freq_noise": False, "gap_count": 0},
            "sampling_stability": "Unknown"
        }

        with PdfPages(pdf_buffer) as pdf:
            # -----------------------------------------------------------------
            # PAGE 1: EXECUTIVE SUMMARY, TIMELINE & DIAGNOSTICS
            # -----------------------------------------------------------------
            fig1 = plt.figure(figsize=(8.5, 11), dpi=150)
            fig1.patch.set_facecolor("#FFFFFF")

            # Title banner
            plt.figtext(0.08, 0.94, "NEUROCARE AI", fontsize=18, fontweight="bold", color="#1E3A78")
            plt.figtext(0.08, 0.92, "Investigational EEG Acquisition & Research Session Report", fontsize=11, fontweight="medium", color="#4767AF")
            plt.figtext(0.72, 0.93, f"Date: {date_str[:10]}", fontsize=9, color="#758EC3", ha="right")

            # Horizontal divider line
            plt.plot([0.08, 0.92], [0.90, 0.90], transform=fig1.transFigure, color="#D1DAEB", lw=1.5)

            # Metadata Table Box
            meta_text = (
                f"Participant ID:       {part_code}\n"
                f"Session Code:         {session_code}\n"
                f"Protocol:             {protocol}\n"
                f"Recording Operator:   {operator}\n"
                f"Timestamp:            {date_str}\n"
                f"Total Duration:       {dur_str}\n"
                f"Total Samples:        {n_samples:,} pts\n"
                f"Hardware Unit:        Arduino UNO R4 WiFi + BioAmp EXG Pill v1.0\n"
                f"Sampling Frequency:   {fs:.1f} Hz (Nominal 256 Hz, 3906 µs interval)\n"
                f"Calibration Status:   Unverified Nominal Hardware Calibration (Gain 2420x, Vref 5.0V)"
            )
            plt.figtext(0.09, 0.74, meta_text, fontsize=8.5, fontfamily="monospace", color="#0E1B38",
                        bbox=dict(boxstyle="round,pad=0.8", facecolor="#F5F8FC", edgecolor="#D1DAEB", lw=1))

            # Quality Assessment Box
            q_color = "#2E7D32" if quality.get("overall_quality") in ("EXCELLENT", "GOOD") else ("#ED6C02" if quality.get("overall_quality") == "FAIR" else "#D32F2F")
            quality_text = (
                f"OVERALL SIGNAL QUALITY: {quality.get('overall_quality', 'UNKNOWN')} ({quality.get('score', 0)}/100)\n"
                f"• Flatline Check (<1.0 µV):         {'ALERT DETECTED' if quality.get('metrics', {}).get('flatline') else 'PASSED (Nominal)'}\n"
                f"• ADC Clipping (>=1000 µV):         {'SATURATION ALERT' if quality.get('metrics', {}).get('clipping') else 'PASSED (Linear Range)'}\n"
                f"• DC Baseline Drift (>100 µV):      {'DRIFT DETECTED' if quality.get('metrics', {}).get('baseline_drift') else 'PASSED (Zero-Centered)'}\n"
                f"• High-Frequency Artifacts:        {'EMG NOISE DETECTED' if quality.get('metrics', {}).get('high_freq_noise') else 'PASSED (Clean)'}\n"
                f"• Packet Timing & Jitter:           {quality.get('sampling_stability', 'Stable')}"
            )
            plt.figtext(0.09, 0.58, quality_text, fontsize=8.5, fontfamily="monospace", color="#0E1B38",
                        bbox=dict(boxstyle="round,pad=0.8", facecolor="#FFFFFF", edgecolor=q_color, lw=1.5))

            # Experimental Event Markers & Notes
            plt.figtext(0.09, 0.54, "EXPERIMENTAL EVENT MARKERS & OPERATOR TIMELINE", fontsize=10, fontweight="bold", color="#1E3A78")
            event_list = events or session.get("events") or []
            if event_list:
                timeline_lines = ["  # | Rel Time (s) | Timestamp (ms) | Event Label          | Notes"]
                timeline_lines.append("  --+--------------+----------------+----------------------+-----------------------------")
                for idx, ev in enumerate(event_list[:8], 1):
                    rel_t = ev.get("relative_time_sec", 0.0)
                    ts_m = ev.get("timestamp_ms", 0)
                    lbl = ev.get("label", "Event")[:20]
                    ev_notes = (ev.get("notes") or "")[:28]
                    timeline_lines.append(f"  {idx:02d}| {rel_t:10.2f}s  | {ts_m:14d} | {lbl:20s} | {ev_notes}")
                timeline_str = "\n".join(timeline_lines)
            else:
                timeline_str = "  No experimental event markers recorded during this acquisition session."

            plt.figtext(0.09, 0.38, timeline_str, fontsize=8, fontfamily="monospace", color="#0E1B38",
                        bbox=dict(boxstyle="round,pad=0.8", facecolor="#F5F8FC", edgecolor="#D1DAEB", lw=1))

            # Operator General Notes
            sess_notes = notes or session.get("notes") or "No general clinical notes entered."
            plt.figtext(0.09, 0.34, "SESSION RESEARCH NOTES", fontsize=10, fontweight="bold", color="#1E3A78")
            plt.figtext(0.09, 0.26, sess_notes[:250], fontsize=8.5, color="#2D3748",
                        bbox=dict(boxstyle="round,pad=0.8", facecolor="#FFFFFF", edgecolor="#D1DAEB", lw=1))

            # Disclaimers Box
            disclaimer = (
                "ETHICAL & REGULATORY RESEARCH DISCLAIMER:\n"
                "This report is generated by the NeuroCare AI platform for investigational research and demonstration purposes only.\n"
                "• NOT FOR CLINICAL DIAGNOSIS: Signals acquired using BioAmp EXG Pill are non-diagnostic single-lead research data.\n"
                "• UNVERIFIED ANALOG CALIBRATION: Microvolt amplitudes are calculated from nominal resistor specifications.\n"
                "• NO MEDICAL INTERPRETATION: Bandpowers, event markers, and spectral metrics must not be used as clinical indicators."
            )
            plt.figtext(0.09, 0.08, disclaimer, fontsize=7.5, color="#742A2A",
                        bbox=dict(boxstyle="round,pad=0.8", facecolor="#FFF5F5", edgecolor="#FEB2B2", lw=1))

            plt.figtext(0.5, 0.03, "Page 1 of 2 — NeuroCare AI Research System", fontsize=8, color="#A0AEC0", ha="center")
            pdf.savefig(fig1)
            plt.close(fig1)

            # -----------------------------------------------------------------
            # PAGE 2: EEG WAVEFORM, PSD SPECTRUM & BANDPOWERS
            # -----------------------------------------------------------------
            fig2 = plt.figure(figsize=(8.5, 11), dpi=150)
            fig2.patch.set_facecolor("#FFFFFF")

            plt.figtext(0.08, 0.94, "NEUROCARE AI — SIGNAL & SPECTRAL ANALYSIS", fontsize=14, fontweight="bold", color="#1E3A78")
            plt.figtext(0.08, 0.92, f"Subject: {part_code} | Session: {session_code[:12]} | Sampling Rate: {fs:.1f} Hz", fontsize=9, color="#758EC3")
            plt.plot([0.08, 0.92], [0.90, 0.90], transform=fig2.transFigure, color="#D1DAEB", lw=1.5)

            # Plot 1: EEG Waveform (Filtered 0.5–29.5 Hz)
            ax1 = fig2.add_axes([0.10, 0.65, 0.82, 0.22])
            plot_samples = samples[:1024] if n_samples > 1024 else samples
            t_axis = np.arange(len(plot_samples)) / fs

            # Filter samples
            filtered_samples = [dsp_service.filter_single_sample(v) for v in plot_samples] if len(plot_samples) > 0 else []

            ax1.plot(t_axis, plot_samples, color="#A3B4D7", lw=0.7, label="Raw Input (µV)", alpha=0.7)
            ax1.plot(t_axis, filtered_samples, color="#1E3A78", lw=1.2, label="Bandpassed 0.5–29.5 Hz")
            ax1.axhline(0, color="#CBD5E0", linestyle="--", lw=0.8)
            ax1.axhline(50, color="#E2E8F0", linestyle=":", lw=0.6)
            ax1.axhline(-50, color="#E2E8F0", linestyle=":", lw=0.6)

            # Draw Event markers on waveform
            if event_list:
                for ev in event_list:
                    ev_t = ev.get("relative_time_sec", 0.0)
                    if 0 <= ev_t <= t_axis[-1] if len(t_axis) > 0 else 0:
                        ax1.axvline(ev_t, color="#E07A5F", linestyle="--", lw=1)
                        ax1.text(ev_t, ax1.get_ylim()[1] * 0.85, f" {ev.get('label', '')[:10]}",
                                 color="#E07A5F", fontsize=7, fontweight="bold", rotation=90)

            ax1.set_title("Single-Channel EEG Waveform (First Epoch)", fontsize=10, fontweight="bold", color="#1E3A78", loc="left")
            ax1.set_xlabel("Time (seconds)", fontsize=8, color="#4A5568")
            ax1.set_ylabel("Amplitude (µV)", fontsize=8, color="#4A5568")
            ax1.tick_params(labelsize=8)
            ax1.legend(loc="upper right", fontsize=7, framealpha=0.9)
            ax1.grid(True, linestyle=":", alpha=0.6)

            # Plot 2: Welch PSD Frequency Spectrum
            ax2 = fig2.add_axes([0.10, 0.38, 0.82, 0.20])
            psd_data = band_analysis.get("psd_spectrum") or band_analysis.get("psd_points") or []
            if psd_data:
                freqs = [p["freq"] for p in psd_data if p["freq"] <= 35.0]
                powers = [p["power"] for p in psd_data if p["freq"] <= 35.0]
                ax2.fill_between(freqs, powers, color="#C0D1EE", alpha=0.5)
                ax2.plot(freqs, powers, color="#1E3A78", lw=1.5)
                # Cutoff line at 29.5 Hz
                ax2.axvline(29.5, color="#E07A5F", linestyle="--", lw=1.2, label="29.5 Hz Hardware Filter Cutoff")
                # Highlight alpha peak if valid
                alpha_peak = band_analysis.get("alpha_peak_hz")
                if alpha_peak is not None and alpha_peak > 0:
                    ax2.axvline(alpha_peak, color="#4767AF", linestyle=":", lw=1.0, label=f"Alpha Peak ({alpha_peak:.1f} Hz)")
                ax2.legend(loc="upper right", fontsize=7)
            else:
                ax2.text(0.5, 0.5, "Insufficient sample count for Welch spectral estimation",
                         ha="center", va="center", color="#718096", fontsize=9)

            ax2.set_title("Power Spectral Density (Welch PSD, Hanning window)", fontsize=10, fontweight="bold", color="#1E3A78", loc="left")
            ax2.set_xlabel("Frequency (Hz)", fontsize=8, color="#4A5568")
            ax2.set_ylabel("PSD (µV²/Hz)", fontsize=8, color="#4A5568")
            ax2.tick_params(labelsize=8)
            ax2.grid(True, linestyle=":", alpha=0.6)

            # Plot 3: Frequency Bandpower Bar Chart
            ax3 = fig2.add_axes([0.10, 0.12, 0.82, 0.18])
            bands = band_analysis.get("bands", {})
            b_names = ["Delta\n(0.5-4 Hz)", "Theta\n(4-8 Hz)", "Alpha\n(8-13 Hz)", "Beta\n(13-29.5 Hz)", "Gamma\n(>30 Hz)"]
            b_powers = [
                bands.get("delta", {}).get("relative_percent", 0.0),
                bands.get("theta", {}).get("relative_percent", 0.0),
                bands.get("alpha", {}).get("relative_percent", 0.0),
                bands.get("beta", {}).get("relative_percent", 0.0),
                0.0  # Gamma cutoff
            ]
            b_colors = ["#758EC3", "#A3B4D7", "#1E3A78", "#E07A5F", "#E2E8F0"]

            bars = ax3.bar(b_names, b_powers, color=b_colors, width=0.55, edgecolor="#CBD5E0")
            for bar, pwr, name in zip(bars, b_powers, b_names):
                if "Gamma" in name:
                    ax3.text(bar.get_x() + bar.get_width() / 2, 5, "HARDWARE\nCUTOFF", ha="center", va="bottom",
                             fontsize=7, fontweight="bold", color="#E07A5F")
                else:
                    ax3.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, f"{pwr:.1f}%",
                             ha="center", va="bottom", fontsize=8, fontweight="bold", color="#2D3748")

            ax3.set_title("Relative Bandpower Distribution (%)", fontsize=10, fontweight="bold", color="#1E3A78", loc="left")
            ax3.set_ylabel("Relative Power (%)", fontsize=8, color="#4A5568")
            ax3.set_ylim(0, max(b_powers + [20]) * 1.25)
            ax3.tick_params(labelsize=8)
            ax3.grid(axis="y", linestyle=":", alpha=0.6)

            plt.figtext(0.5, 0.03, "Page 2 of 2 — NeuroCare AI Research System", fontsize=8, color="#A0AEC0", ha="center")
            pdf.savefig(fig2)
            plt.close(fig2)

        pdf_bytes = pdf_buffer.getvalue()
        pdf_buffer.close()
        logger.info("Generated PDF report for session %s (%d bytes)", session_code, len(pdf_bytes))
        return pdf_bytes


pdf_report_service = PDFReportService()
