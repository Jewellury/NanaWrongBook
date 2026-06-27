/**
 * EmptyHint — 首页空状态提示（无记录态）
 *
 * 遵循 P4 措辞铁律：禁用"你还没有任何数据"，改用"第一道题，会点亮第一个光点"
 */
export function EmptyHint() {
  return (
    <div className="rounded-2xl border border-dashed border-[#E8E0D4] bg-white/60 p-5 text-center">
      <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-amber-100">
        <span className="text-xl" aria-hidden="true">
          ⭐
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[#6B625A]">
        你的光点地图还空着，
        <br />
        第一道题，会点亮第一个光点。
      </p>
    </div>
  );
}
