import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { computeFeeCents, formatDuration, formatMoney, type ParkingArea } from '@parkpay/shared';
import { radius, space, useTheme } from '../theme';
import WheelPicker from './WheelPicker';
import { Button, Chip, Row } from './ui';

const STEP = 5; // minutes
const MIN = 5;

const pad = (n: number) => String(n).padStart(2, '0');

/** "How long will you park?" with hour and minute wheels, quick presets, the finish time and an estimated cost. */
export default function DurationSheet({
  visible,
  area,
  initial,
  onClose,
  onConfirm,
  maxMinutes,
  title,
}: {
  visible: boolean;
  area: ParkingArea | null;
  /** current planned minutes, or null for "until I end it" */
  initial: number | null;
  onClose: () => void;
  onConfirm: (minutes: number | null) => void;
  /** Extending a running session: the cap is what is left of the maximum stay, and no cost estimate is shown. */
  maxMinutes?: number;
  title?: string;
}) {
  const t = useTheme();
  const extending = maxMinutes != null;
  const maxMin = Math.max(MIN, Math.min(maxMinutes ?? area?.max_stay_minutes ?? 24 * 60, 24 * 60));
  const maxHours = Math.floor(maxMin / 60);
  const [minutes, setMinutes] = useState<number>(initial ?? 60);

  useEffect(() => {
    if (visible) setMinutes(Math.min(Math.max(Math.ceil((initial ?? 60) / STEP) * STEP, MIN), maxMin)); // wheels move in 5-minute steps
  }, [visible, initial, maxMin]);

  const hourItems = useMemo(() => Array.from({ length: maxHours + 1 }, (_, h) => `${h}`), [maxHours]);
  const minuteItems = useMemo(() => Array.from({ length: 60 / STEP }, (_, i) => pad(i * STEP)), []);

  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / STEP);
  const clamp = (total: number) => Math.min(Math.max(total, MIN), maxMin);

  const setH = (hh: number) => setMinutes(clamp(hh * 60 + (minutes % 60)));
  const setM = (mi: number) => setMinutes(clamp(h * 60 + mi * STEP));

  const finish = new Date(Date.now() + minutes * 60_000);
  const finishText = finish.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const estimate = area ? computeFeeCents(area.plan, area.timezone, Date.now(), Date.now() + minutes * 60_000) : null;
  const presets = [30, 60, 120, 240].filter((p) => p <= maxMin);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: t.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.border }} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{title ?? 'How long will you park?'}</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>You only pay for the time you actually use.</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <WheelPicker items={hourItems} index={Math.min(h, maxHours)} onChange={setH} width={88} label="Hours" />
          <Text style={{ color: t.muted, fontSize: 15, fontWeight: '600', width: 36 }}>hr</Text>
          <WheelPicker items={minuteItems} index={m % (60 / STEP)} onChange={setM} width={88} label="Minutes" />
          <Text style={{ color: t.muted, fontSize: 15, fontWeight: '600', width: 36 }}>min</Text>
        </View>

        <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <Chip key={p} text={p < 60 ? `${p} min` : `${p / 60} h`} active={minutes === p} onPress={() => setMinutes(clamp(p))} />
          ))}
        </Row>

        <View style={{ backgroundColor: t.brandSoft, borderRadius: radius.card, padding: space.md, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: t.muted, fontSize: 13 }}>Until about</Text>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{finishText}</Text>
          </View>
          {extending ? null : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>Estimated cost</Text>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {estimate == null || !area ? '-' : estimate === 0 ? 'Free' : formatMoney(estimate, area.plan.currency)}
              </Text>
            </View>
          )}
        </View>
        {extending ? (
          <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>Counted from now. You still pay only for the time you use{area?.max_stay_minutes ? `; ${formatDuration(maxMin)} of the maximum stay is left` : ''}.</Text>
        ) : area?.max_stay_minutes ? (
          <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>This area allows up to {formatDuration(area.max_stay_minutes)}.</Text>
        ) : null}

        <Button title="Set time" icon="checkmark" onPress={() => onConfirm(minutes)} />
        <Button variant="ghost" title="Park until I end it" onPress={() => onConfirm(null)} />
      </SafeAreaView>
    </Modal>
  );
}
