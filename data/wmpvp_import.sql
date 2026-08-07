-- ============================================================
-- HVV MAJOR 当前届：将排位赛比赛结果（44 场，源自完美对战平台）更新到已有对阵
-- 说明：忽略无时间记录 2 场；只更新比分/地图/时间，轮次保持原位不动
-- 可重复执行（重复更新结果一致）
-- ============================================================

-- ① 清理上次误导入的记录（全部挤在第 1 轮、带比分和时间的排位赛记录）
--    注意：若你已手动维护了第 1 轮比分，请跳过这条 DELETE
delete from public.matches m
using public.stages s
where m.stage_id = s.id
  and s.name = '排位赛 · 4轮BO1'
  and m.round_number = 1
  and m.status = 'completed'
  and m.map is not null
  and m.scheduled_at is not null;

-- ② 更新已有对阵的比分/地图/时间（round_number 不动，保持原位）
update public.matches m
set team_a_score = case when m.team_a_id = ta.id then x.a_score else x.b_score end,
    team_b_score = case when m.team_a_id = ta.id then x.b_score else x.a_score end,
    winner_id = case
      when x.a_score > x.b_score and m.team_a_id = ta.id then ta.id
      when x.a_score > x.b_score and m.team_a_id = tb.id then tb.id
      when x.b_score > x.a_score and m.team_a_id = ta.id then tb.id
      when x.b_score > x.a_score and m.team_a_id = tb.id then ta.id
      else null end,
    map = x.map,
    scheduled_at = x.scheduled_at::timestamptz,
    best_of = 1,
    status = 'completed'
from (
  select '五个外包' as a_name, '蹬峰造极2.0' as b_name, 13 as a_score, 8 as b_score, '炼狱小镇' as map, '2026-08-05' as scheduled_at, '传奇组' as gname
union all
  select 'STORMGAME' as a_name, '外包杀手' as b_name, 13 as a_score, 11 as b_score, '远古遗迹' as map, '2026-08-05' as scheduled_at, '大师组' as gname
union all
  select '打赢我们是给' as a_name, 'Null Pressure' as b_name, 9 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '传奇组' as gname
union all
  select '离冠只差一把' as a_name, '来杯好茶摇一摇' as b_name, 11 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-08-02' as scheduled_at, '挑战组' as gname
union all
  select '峰狂星期四' as a_name, '泥头车3.0' as b_name, 13 as a_score, 9 as b_score, '远古遗迹' as map, '2026-08-02' as scheduled_at, '传奇组' as gname
union all
  select '步枪大队' as a_name, '来杯好茶摇一摇' as b_name, 8 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '挑战组' as gname
union all
  select 'STORMGAME' as a_name, 'BackToBasic' as b_name, 5 as a_score, 13 as b_score, '死城之谜' as map, '2026-08-02' as scheduled_at, '大师组' as gname
union all
  select '没有队名' as a_name, 'HWmajor11_Team5' as b_name, 13 as a_score, 1 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '大师组' as gname
union all
  select 'HWmajor11_Team5' as a_name, '六辣子夹馍' as b_name, 13 as a_score, 16 as b_score, '远古遗迹' as map, '2026-08-01' as scheduled_at, '大师组' as gname
union all
  select 'T2爆了' as a_name, 'FAGMajor11' as b_name, 13 as a_score, 3 as b_score, '荒漠迷城' as map, '2026-07-30' as scheduled_at, '挑战组' as gname
union all
  select '离冠只差一把' as a_name, 'T2爆了' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-30' as scheduled_at, '挑战组' as gname
union all
  select '华尔孔Hualcons' as a_name, 'FAGMajor11' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-29' as scheduled_at, '挑战组' as gname
union all
  select '五个外包' as a_name, '打不过我的是GAY' as b_name, 9 as a_score, 13 as b_score, '炼狱小镇' as map, '2026-07-29' as scheduled_at, '传奇组' as gname
union all
  select 'hw邱邱畅' as a_name, 'FAGMajor11' as b_name, 13 as a_score, 6 as b_score, '远古遗迹' as map, '2026-07-29' as scheduled_at, '挑战组' as gname
union all
  select '那个男人在这' as a_name, '没有队名' as b_name, 1 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-29' as scheduled_at, '大师组' as gname
union all
  select '步枪大队' as a_name, '本质好人' as b_name, 8 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
union all
  select 'T2爆了' as a_name, '华尔孔Hualcons' as b_name, 13 as a_score, 4 as b_score, '荒漠迷城' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
union all
  select '打赢我的是向日葵' as a_name, '步枪大队' as b_name, 11 as a_score, 13 as b_score, '阿努比斯' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
union all
  select '本质好人' as a_name, '步枪大队' as b_name, 13 as a_score, 5 as b_score, '远古遗迹' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
union all
  select '传奇捕峰人' as a_name, '打不过我的是GAY' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, '传奇组' as gname
union all
  select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 9 as b_score, '荒漠迷城' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
union all
  select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 7 as b_score, '炙热沙城Ⅱ' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
union all
  select '峰狂星期四' as a_name, '传奇捕峰人' as b_name, 13 as a_score, 16 as b_score, '炙热沙城Ⅱ' as map, '2026-07-24' as scheduled_at, '传奇组' as gname
union all
  select '没有队名' as a_name, 'STORMGAME' as b_name, 10 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-24' as scheduled_at, '大师组' as gname
union all
  select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 3 as a_score, 13 as b_score, '核子危机' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
union all
  select '峰狂星期四' as a_name, '打赢我们是给' as b_name, 13 as a_score, 0 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '传奇组' as gname
union all
  select 'T2爆了' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 4 as b_score, '炙热沙城Ⅱ' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
union all
  select '打赢我的是向日葵' as a_name, 'FAGMajor11' as b_name, 10 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
union all
  select '打赢我们是给' as a_name, '五个外包' as b_name, 9 as a_score, 13 as b_score, '炼狱小镇' as map, '2026-07-22' as scheduled_at, '传奇组' as gname
union all
  select 'BackToBasic' as a_name, '外包杀手' as b_name, 8 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '大师组' as gname
union all
  select '来杯好茶摇一摇' as a_name, '华尔孔Hualcons' as b_name, 11 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
union all
  select '外包杀手' as a_name, '那个男人在这' as b_name, 13 as a_score, 2 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '大师组' as gname
union all
  select '打赢我的是向日葵' as a_name, '本质好人' as b_name, 13 as a_score, 9 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '挑战组' as gname
union all
  select '蹬峰造极2.0' as a_name, 'Null Pressure' as b_name, 4 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '传奇组' as gname
union all
  select 'but one day' as a_name, '那个男人在这' as b_name, 13 as a_score, 8 as b_score, '远古遗迹' as map, '2026-07-19' as scheduled_at, '大师组' as gname
union all
  select '六辣子夹馍' as a_name, '外包杀手' as b_name, 13 as a_score, 11 as b_score, '炙热沙城Ⅱ' as map, '2026-07-18' as scheduled_at, '大师组' as gname
union all
  select 'hw邱邱畅' as a_name, '离冠只差一把' as b_name, 13 as a_score, 4 as b_score, '阿努比斯' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
union all
  select 'Team Ten' as a_name, '打赢我的是向日葵' as b_name, 6 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
union all
  select '那个男人在这' as a_name, 'STORMGAME' as b_name, 13 as a_score, 9 as b_score, '炼狱小镇' as map, '2026-07-17' as scheduled_at, '大师组' as gname
union all
  select 'Team Ten' as a_name, 'hw邱邱畅' as b_name, 1 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
union all
  select '本质好人' as a_name, '离冠只差一把' as b_name, 13 as a_score, 3 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '挑战组' as gname
union all
  select '打赢我们是给' as a_name, '打不过我的是GAY' as b_name, 13 as a_score, 10 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '传奇组' as gname
union all
  select '泥头车3.0' as a_name, '蹬峰造极2.0' as b_name, 12 as a_score, 16 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '传奇组' as gname
union all
  select '五个外包' as a_name, '传奇捕峰人' as b_name, 13 as a_score, 6 as b_score, '炙热沙城Ⅱ' as map, '2026-07-14' as scheduled_at, '传奇组' as gname
) x
join public.groups g on g.name = x.gname
join public.stages s
  on s.name = '排位赛 · 4轮BO1'
 and s.event_id = (select id from public.events where status in ('signup','running') order by edition desc limit 1)
 and s.group_id = g.id
join public.teams ta on ta.name = x.a_name
join public.teams tb on tb.name = x.b_name
where m.stage_id = s.id
  and ((m.team_a_id = ta.id and m.team_b_id = tb.id)
    or (m.team_a_id = tb.id and m.team_b_id = ta.id));

-- ============ 比赛录像（完美对战 DEMO 链接 → match_media） ============
insert into public.match_media (match_id, kind, label, url)
select m.id, 'vod', '完美对战DEMO', x.demo_url
from (
  select '五个外包' as a_name, '蹬峰造极2.0' as b_name, '炼狱小镇' as map, '2026-08-05' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3951423888_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106305%3B1786192765%26q-key-time%3D1786106305%3B1786192765%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Df39f48f180a91f4ec6fe43bb72003c193eb12a20&amp;response-content-disposition=attachment%3Bfilename%3D3951423888_1000003238.dem.zip' as demo_url
union all
  select 'STORMGAME' as a_name, '外包杀手' as b_name, '远古遗迹' as map, '2026-08-05' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3951327248_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106305%3B1786192765%26q-key-time%3D1786106305%3B1786192765%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D56ef3d2f36946a43532dbe316c69c75f2372813c&amp;response-content-disposition=attachment%3Bfilename%3D3951327248_1000003238.dem.zip' as demo_url
union all
  select '打赢我们是给' as a_name, 'Null Pressure' as b_name, '荒漠迷城' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3936797200_1000003238.dem?Expires=1786192765&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3936797200_1000003238.dem.zip&amp;Signature=vh8jVig0txy%2B0picMobI8CaJg4c%3D' as demo_url
union all
  select '离冠只差一把' as a_name, '来杯好茶摇一摇' as b_name, '炙热沙城Ⅱ' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3936688016_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106305%3B1786192765%26q-key-time%3D1786106305%3B1786192765%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D9b30963038db94b2d629f209be3d16a3e37bba64&amp;response-content-disposition=attachment%3Bfilename%3D3936688016_1000003238.dem.zip' as demo_url
union all
  select '峰狂星期四' as a_name, '泥头车3.0' as b_name, '远古遗迹' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3936617616_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106305%3B1786192765%26q-key-time%3D1786106305%3B1786192765%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Dc9ce74ca77e96980f55be140c89679b259447a19&amp;response-content-disposition=attachment%3Bfilename%3D3936617616_1000003238.dem.zip' as demo_url
union all
  select '步枪大队' as a_name, '来杯好茶摇一摇' as b_name, '荒漠迷城' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3936586128_1000003238.dem?Expires=1786192765&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3936586128_1000003238.dem.zip&amp;Signature=8IDMNghxV5DF%2FihcXxjEgo8RmuI%3D' as demo_url
union all
  select 'STORMGAME' as a_name, 'BackToBasic' as b_name, '死城之谜' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3936555152_1000003238.dem?Expires=1786192766&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3936555152_1000003238.dem.zip&amp;Signature=swOb%2BIKXWzeu8aTy2eR1czab4B0%3D' as demo_url
union all
  select '没有队名' as a_name, 'HWmajor11_Team5' as b_name, '荒漠迷城' as map, '2026-08-02' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3936546448_1000003238.dem?Expires=1786192766&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3936546448_1000003238.dem.zip&amp;Signature=8w%2B5lrNalQsyJCGGvk%2FggBz4hRo%3D' as demo_url
union all
  select 'HWmajor11_Team5' as a_name, '六辣子夹馍' as b_name, '远古遗迹' as map, '2026-08-01' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3933074832_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106042%3B1786192502%26q-key-time%3D1786106042%3B1786192502%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D4751558bf97945bd26f8a6ae2ee3c763f4641006&amp;response-content-disposition=attachment%3Bfilename%3D3933074832_1000003238.dem.zip' as demo_url
union all
  select 'T2爆了' as a_name, 'FAGMajor11' as b_name, '荒漠迷城' as map, '2026-07-30' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3924248336_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106042%3B1786192502%26q-key-time%3D1786106042%3B1786192502%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D8d748cbeff7d5294c2255a9b49878be571062fd1&amp;response-content-disposition=attachment%3Bfilename%3D3924248336_1000003238.dem.zip' as demo_url
union all
  select '离冠只差一把' as a_name, 'T2爆了' as b_name, '炙热沙城Ⅱ' as map, '2026-07-30' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3924114192_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D826d8ac2e3f94175e07c9b3822981ba44597b9a8&amp;response-content-disposition=attachment%3Bfilename%3D3924114192_1000003238.dem.zip' as demo_url
union all
  select '华尔孔Hualcons' as a_name, 'FAGMajor11' as b_name, '炙热沙城Ⅱ' as map, '2026-07-29' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3920114704_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Dcde4cc315f29869470c4311bec016e442c94511e&amp;response-content-disposition=attachment%3Bfilename%3D3920114704_1000003238.dem.zip' as demo_url
union all
  select '五个外包' as a_name, '打不过我的是GAY' as b_name, '炼狱小镇' as map, '2026-07-29' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3919418000_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106306%3B1786192766%26q-key-time%3D1786106306%3B1786192766%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D9531880d181e67a0a2a7738ba532b650757c8697&amp;response-content-disposition=attachment%3Bfilename%3D3919418000_1000003238.dem.zip' as demo_url
union all
  select 'hw邱邱畅' as a_name, 'FAGMajor11' as b_name, '远古遗迹' as map, '2026-07-29' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3919319184_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106306%3B1786192766%26q-key-time%3D1786106306%3B1786192766%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Dba86e99b84a2a8a878aa8ad05a4e5018f7fe9745&amp;response-content-disposition=attachment%3Bfilename%3D3919319184_1000003238.dem.zip' as demo_url
union all
  select '那个男人在这' as a_name, '没有队名' as b_name, '荒漠迷城' as map, '2026-07-29' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3919177872_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106306%3B1786192766%26q-key-time%3D1786106306%3B1786192766%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D7a904d868b45e147cddfb15bfd254bc25c82748d&amp;response-content-disposition=attachment%3Bfilename%3D3919177872_1000003238.dem.zip' as demo_url
union all
  select '步枪大队' as a_name, '本质好人' as b_name, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3905468816_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D7fe88861ae8eab1a0ef886857c59a1fe124fb28e&amp;response-content-disposition=attachment%3Bfilename%3D3905468816_1000003238.dem.zip' as demo_url
union all
  select 'T2爆了' as a_name, '华尔孔Hualcons' as b_name, '荒漠迷城' as map, '2026-07-26' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3905341200_1000003238.dem?Expires=1786192766&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3905341200_1000003238.dem.zip&amp;Signature=IJvGM4ilpahb3VG9Ahx1IPC2UOc%3D' as demo_url
union all
  select '打赢我的是向日葵' as a_name, '步枪大队' as b_name, '阿努比斯' as map, '2026-07-26' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3905312272_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D7b8e2f8249b9e2ab01b0dbfcf2e14e68176cca5a&amp;response-content-disposition=attachment%3Bfilename%3D3905312272_1000003238.dem.zip' as demo_url
union all
  select '本质好人' as a_name, '步枪大队' as b_name, '远古遗迹' as map, '2026-07-26' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3905202576_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3De1ef30b5acf9ba97f91159947ae8998e433da681&amp;response-content-disposition=attachment%3Bfilename%3D3905202576_1000003238.dem.zip' as demo_url
union all
  select '传奇捕峰人' as a_name, '打不过我的是GAY' as b_name, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3905202064_1000003238.dem?Expires=1786192767&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3905202064_1000003238.dem.zip&amp;Signature=EYWmAfrSczOPObJK5q1O8DyxIGk%3D' as demo_url
union all
  select '峰狂星期四' as a_name, '传奇捕峰人' as b_name, '炙热沙城Ⅱ' as map, '2026-07-24' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3898433040_1000003238.dem?Expires=1786192767&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3898433040_1000003238.dem.zip&amp;Signature=oRXUjpSPHnUIpA4DuQXXecekRXY%3D' as demo_url
union all
  select '没有队名' as a_name, 'STORMGAME' as b_name, '远古遗迹' as map, '2026-07-24' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3898432016_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106307%3B1786192767%26q-key-time%3D1786106307%3B1786192767%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Ddc083e8c99ce731a4a032472f3683ad0d6f2ff7b&amp;response-content-disposition=attachment%3Bfilename%3D3898432016_1000003238.dem.zip' as demo_url
union all
  select '峰狂星期四' as a_name, '打赢我们是给' as b_name, '远古遗迹' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-cd.oss-cn-chengdu.aliyuncs.com/demo/match/3891740944_1000003238.dem?Expires=1786192770&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3891740944_1000003238.dem.zip&amp;Signature=M%2FcdeBs7dkOPJxNZWP5wIUCkZXQ%3D' as demo_url
union all
  select 'T2爆了' as a_name, '来杯好茶摇一摇' as b_name, '炙热沙城Ⅱ' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3891574032_1000003238.dem?Expires=1786192770&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3891574032_1000003238.dem.zip&amp;Signature=gji87FneixPKmeR9oiC68MLzMKY%3D' as demo_url
union all
  select '打赢我的是向日葵' as a_name, 'FAGMajor11' as b_name, '远古遗迹' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3891401744_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106043%3B1786192503%26q-key-time%3D1786106043%3B1786192503%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D56c0c33ecd7722da7f4dfba804a5d017f567ab22&amp;response-content-disposition=attachment%3Bfilename%3D3891401744_1000003238.dem.zip' as demo_url
union all
  select '打赢我们是给' as a_name, '五个外包' as b_name, '炼狱小镇' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3891276048_1000003238.dem?Expires=1786192770&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3891276048_1000003238.dem.zip&amp;Signature=cRUbCFOur5bqc6b%2BjOsrmLqQSHI%3D' as demo_url
union all
  select 'BackToBasic' as a_name, '外包杀手' as b_name, '远古遗迹' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3891215120_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106310%3B1786192770%26q-key-time%3D1786106310%3B1786192770%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D7a6b226e426d572cb2433f2d003262d93ef1c9a5&amp;response-content-disposition=attachment%3Bfilename%3D3891215120_1000003238.dem.zip' as demo_url
union all
  select '来杯好茶摇一摇' as a_name, '华尔孔Hualcons' as b_name, '荒漠迷城' as map, '2026-07-22' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3891208080_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106310%3B1786192770%26q-key-time%3D1786106310%3B1786192770%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Df5c30a4c1595133a241623288397086d4b8510b5&amp;response-content-disposition=attachment%3Bfilename%3D3891208080_1000003238.dem.zip' as demo_url
union all
  select '外包杀手' as a_name, '那个男人在这' as b_name, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3879659280_1000003238.dem?Expires=1786192503&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3879659280_1000003238.dem.zip&amp;Signature=XE3W%2BfpWUu4S2o7dC3dDm6uN9nQ%3D' as demo_url
union all
  select '打赢我的是向日葵' as a_name, '本质好人' as b_name, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3879648272_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106044%3B1786192504%26q-key-time%3D1786106044%3B1786192504%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D0eda6a319a6bfe8a242ac101b2c3fb8e4b06ec1a&amp;response-content-disposition=attachment%3Bfilename%3D3879648272_1000003238.dem.zip' as demo_url
union all
  select '蹬峰造极2.0' as a_name, 'Null Pressure' as b_name, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3878439696_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106310%3B1786192770%26q-key-time%3D1786106310%3B1786192770%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3De8c0d4482fd282136c1fc9dbd0bbbf4ec8d92daf&amp;response-content-disposition=attachment%3Bfilename%3D3878439696_1000003238.dem.zip' as demo_url
union all
  select 'but one day' as a_name, '那个男人在这' as b_name, '远古遗迹' as map, '2026-07-19' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3878429584_1000003238.dem?Expires=1786192770&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3878429584_1000003238.dem.zip&amp;Signature=4FoGUqem9BsXkmTI4Gpg4lQwg8U%3D' as demo_url
union all
  select '六辣子夹馍' as a_name, '外包杀手' as b_name, '炙热沙城Ⅱ' as map, '2026-07-18' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3875531792_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106311%3B1786192771%26q-key-time%3D1786106311%3B1786192771%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D618b1e73e969354d9b805f0886cf6a00feca23af&amp;response-content-disposition=attachment%3Bfilename%3D3875531792_1000003238.dem.zip' as demo_url
union all
  select 'hw邱邱畅' as a_name, '离冠只差一把' as b_name, '阿努比斯' as map, '2026-07-17' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3872336528_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106044%3B1786192504%26q-key-time%3D1786106044%3B1786192504%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Dcf7829aad8baec390dad6656dcc73ac68705ec9a&amp;response-content-disposition=attachment%3Bfilename%3D3872336528_1000003238.dem.zip' as demo_url
union all
  select 'Team Ten' as a_name, '打赢我的是向日葵' as b_name, '炙热沙城Ⅱ' as map, '2026-07-17' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3872336016_1000003238.dem?Expires=1786192504&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3872336016_1000003238.dem.zip&amp;Signature=Jpd%2FSugfSvABBAiHJPhuZIyz%2F%2BM%3D' as demo_url
union all
  select '那个男人在这' as a_name, 'STORMGAME' as b_name, '炼狱小镇' as map, '2026-07-17' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3872335504_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106311%3B1786192771%26q-key-time%3D1786106311%3B1786192771%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D6bce3db88fe790d21f8c29803ff2933d5d277c57&amp;response-content-disposition=attachment%3Bfilename%3D3872335504_1000003238.dem.zip' as demo_url
union all
  select 'Team Ten' as a_name, 'hw邱邱畅' as b_name, '荒漠迷城' as map, '2026-07-17' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3872198672_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106044%3B1786192504%26q-key-time%3D1786106044%3B1786192504%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3Db788c2132889d6a5e05ef7bc38e5695993ba1706&amp;response-content-disposition=attachment%3Bfilename%3D3872198672_1000003238.dem.zip' as demo_url
union all
  select '本质好人' as a_name, '离冠只差一把' as b_name, '远古遗迹' as map, '2026-07-15' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3865451408_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106311%3B1786192771%26q-key-time%3D1786106311%3B1786192771%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D19687e1900fac4b26a451800bd5386f160ba2a59&amp;response-content-disposition=attachment%3Bfilename%3D3865451408_1000003238.dem.zip' as demo_url
union all
  select '打赢我们是给' as a_name, '打不过我的是GAY' as b_name, '远古遗迹' as map, '2026-07-15' as scheduled_at, 'https://pvp-demo-sz.oss-cn-shenzhen.aliyuncs.com/demo/match/3865313552_1000003238.dem?Expires=1786192504&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3865313552_1000003238.dem.zip&amp;Signature=lo1iE5H4KNbSQhU1%2F7Ydx5Wwvd8%3D' as demo_url
union all
  select '泥头车3.0' as a_name, '蹬峰造极2.0' as b_name, '远古遗迹' as map, '2026-07-15' as scheduled_at, 'https://pvp-demo-hz.oss-cn-hangzhou.aliyuncs.com/demo/match/3865301776_1000003238.dem?Expires=1786192771&amp;OSSAccessKeyId=LTAI4FdozZjF98JnnYvJRUeQ&amp;response-content-disposition=attachment%3Bfilename%3D3865301776_1000003238.dem.zip&amp;Signature=lObocpUpkQ8Eg%2Fw9krmwfP9Ij%2FI%3D' as demo_url
union all
  select '五个外包' as a_name, '传奇捕峰人' as b_name, '炙热沙城Ⅱ' as map, '2026-07-14' as scheduled_at, 'https://pvp-demo-sh-1301671788.wmpvp.com/demo/match/3861809296_1000003238.dem?sign=q-sign-algorithm%3Dsha1%26q-ak%3DAKIDkIabMq3zf3A0YppYzA4g16uTmoZ3GCrF%26q-sign-time%3D1786106311%3B1786192771%26q-key-time%3D1786106311%3B1786192771%26q-header-list%3Dhost%26q-url-param-list%3Dresponse-content-disposition%26q-signature%3D560ee9512138889522d36be51f8beeb70b489554&amp;response-content-disposition=attachment%3Bfilename%3D3861809296_1000003238.dem.zip' as demo_url
) x
join public.teams ta on ta.name = x.a_name
join public.teams tb on tb.name = x.b_name
join public.matches m
  on ((m.team_a_id = ta.id and m.team_b_id = tb.id)
    or (m.team_a_id = tb.id and m.team_b_id = ta.id))
 and m.map = x.map
 and m.scheduled_at = x.scheduled_at::timestamptz
where not exists (
  select 1 from public.match_media mm
  where mm.match_id = m.id and mm.kind = 'vod' and mm.url = x.demo_url
);

-- ※ 可选诊断：若上方 UPDATE 影响的记录数少于 44，
--    说明部分比赛在系统已有对阵中匹配不到（缺对阵或队名有出入）。
--    取消注释运行下面查询，即可查看哪些比赛未匹配上：
-- select x.a_name as 队A, x.b_name as 队B, x.map as 地图, x.scheduled_at as 日期, x.gname as 组别
-- from (
--   select '五个外包' as a_name, '蹬峰造极2.0' as b_name, 13 as a_score, 8 as b_score, '炼狱小镇' as map, '2026-08-05' as scheduled_at, '传奇组' as gname
-- union all
--   select 'STORMGAME' as a_name, '外包杀手' as b_name, 13 as a_score, 11 as b_score, '远古遗迹' as map, '2026-08-05' as scheduled_at, '大师组' as gname
-- union all
--   select '打赢我们是给' as a_name, 'Null Pressure' as b_name, 9 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '传奇组' as gname
-- union all
--   select '离冠只差一把' as a_name, '来杯好茶摇一摇' as b_name, 11 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-08-02' as scheduled_at, '挑战组' as gname
-- union all
--   select '峰狂星期四' as a_name, '泥头车3.0' as b_name, 13 as a_score, 9 as b_score, '远古遗迹' as map, '2026-08-02' as scheduled_at, '传奇组' as gname
-- union all
--   select '步枪大队' as a_name, '来杯好茶摇一摇' as b_name, 8 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '挑战组' as gname
-- union all
--   select 'STORMGAME' as a_name, 'BackToBasic' as b_name, 5 as a_score, 13 as b_score, '死城之谜' as map, '2026-08-02' as scheduled_at, '大师组' as gname
-- union all
--   select '没有队名' as a_name, 'HWmajor11_Team5' as b_name, 13 as a_score, 1 as b_score, '荒漠迷城' as map, '2026-08-02' as scheduled_at, '大师组' as gname
-- union all
--   select 'HWmajor11_Team5' as a_name, '六辣子夹馍' as b_name, 13 as a_score, 16 as b_score, '远古遗迹' as map, '2026-08-01' as scheduled_at, '大师组' as gname
-- union all
--   select 'T2爆了' as a_name, 'FAGMajor11' as b_name, 13 as a_score, 3 as b_score, '荒漠迷城' as map, '2026-07-30' as scheduled_at, '挑战组' as gname
-- union all
--   select '离冠只差一把' as a_name, 'T2爆了' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-30' as scheduled_at, '挑战组' as gname
-- union all
--   select '华尔孔Hualcons' as a_name, 'FAGMajor11' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-29' as scheduled_at, '挑战组' as gname
-- union all
--   select '五个外包' as a_name, '打不过我的是GAY' as b_name, 9 as a_score, 13 as b_score, '炼狱小镇' as map, '2026-07-29' as scheduled_at, '传奇组' as gname
-- union all
--   select 'hw邱邱畅' as a_name, 'FAGMajor11' as b_name, 13 as a_score, 6 as b_score, '远古遗迹' as map, '2026-07-29' as scheduled_at, '挑战组' as gname
-- union all
--   select '那个男人在这' as a_name, '没有队名' as b_name, 1 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-29' as scheduled_at, '大师组' as gname
-- union all
--   select '步枪大队' as a_name, '本质好人' as b_name, 8 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
-- union all
--   select 'T2爆了' as a_name, '华尔孔Hualcons' as b_name, 13 as a_score, 4 as b_score, '荒漠迷城' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
-- union all
--   select '打赢我的是向日葵' as a_name, '步枪大队' as b_name, 11 as a_score, 13 as b_score, '阿努比斯' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
-- union all
--   select '本质好人' as a_name, '步枪大队' as b_name, 13 as a_score, 5 as b_score, '远古遗迹' as map, '2026-07-26' as scheduled_at, '挑战组' as gname
-- union all
--   select '传奇捕峰人' as a_name, '打不过我的是GAY' as b_name, 5 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-26' as scheduled_at, '传奇组' as gname
-- union all
--   select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 9 as b_score, '荒漠迷城' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
-- union all
--   select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 7 as b_score, '炙热沙城Ⅱ' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
-- union all
--   select '峰狂星期四' as a_name, '传奇捕峰人' as b_name, 13 as a_score, 16 as b_score, '炙热沙城Ⅱ' as map, '2026-07-24' as scheduled_at, '传奇组' as gname
-- union all
--   select '没有队名' as a_name, 'STORMGAME' as b_name, 10 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-24' as scheduled_at, '大师组' as gname
-- union all
--   select 'hw邱邱畅' as a_name, '来杯好茶摇一摇' as b_name, 3 as a_score, 13 as b_score, '核子危机' as map, '2026-07-24' as scheduled_at, '挑战组' as gname
-- union all
--   select '峰狂星期四' as a_name, '打赢我们是给' as b_name, 13 as a_score, 0 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '传奇组' as gname
-- union all
--   select 'T2爆了' as a_name, '来杯好茶摇一摇' as b_name, 13 as a_score, 4 as b_score, '炙热沙城Ⅱ' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
-- union all
--   select '打赢我的是向日葵' as a_name, 'FAGMajor11' as b_name, 10 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
-- union all
--   select '打赢我们是给' as a_name, '五个外包' as b_name, 9 as a_score, 13 as b_score, '炼狱小镇' as map, '2026-07-22' as scheduled_at, '传奇组' as gname
-- union all
--   select 'BackToBasic' as a_name, '外包杀手' as b_name, 8 as a_score, 13 as b_score, '远古遗迹' as map, '2026-07-22' as scheduled_at, '大师组' as gname
-- union all
--   select '来杯好茶摇一摇' as a_name, '华尔孔Hualcons' as b_name, 11 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-22' as scheduled_at, '挑战组' as gname
-- union all
--   select '外包杀手' as a_name, '那个男人在这' as b_name, 13 as a_score, 2 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '大师组' as gname
-- union all
--   select '打赢我的是向日葵' as a_name, '本质好人' as b_name, 13 as a_score, 9 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '挑战组' as gname
-- union all
--   select '蹬峰造极2.0' as a_name, 'Null Pressure' as b_name, 4 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-19' as scheduled_at, '传奇组' as gname
-- union all
--   select 'but one day' as a_name, '那个男人在这' as b_name, 13 as a_score, 8 as b_score, '远古遗迹' as map, '2026-07-19' as scheduled_at, '大师组' as gname
-- union all
--   select '六辣子夹馍' as a_name, '外包杀手' as b_name, 13 as a_score, 11 as b_score, '炙热沙城Ⅱ' as map, '2026-07-18' as scheduled_at, '大师组' as gname
-- union all
--   select 'hw邱邱畅' as a_name, '离冠只差一把' as b_name, 13 as a_score, 4 as b_score, '阿努比斯' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
-- union all
--   select 'Team Ten' as a_name, '打赢我的是向日葵' as b_name, 6 as a_score, 13 as b_score, '炙热沙城Ⅱ' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
-- union all
--   select '那个男人在这' as a_name, 'STORMGAME' as b_name, 13 as a_score, 9 as b_score, '炼狱小镇' as map, '2026-07-17' as scheduled_at, '大师组' as gname
-- union all
--   select 'Team Ten' as a_name, 'hw邱邱畅' as b_name, 1 as a_score, 13 as b_score, '荒漠迷城' as map, '2026-07-17' as scheduled_at, '挑战组' as gname
-- union all
--   select '本质好人' as a_name, '离冠只差一把' as b_name, 13 as a_score, 3 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '挑战组' as gname
-- union all
--   select '打赢我们是给' as a_name, '打不过我的是GAY' as b_name, 13 as a_score, 10 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '传奇组' as gname
-- union all
--   select '泥头车3.0' as a_name, '蹬峰造极2.0' as b_name, 12 as a_score, 16 as b_score, '远古遗迹' as map, '2026-07-15' as scheduled_at, '传奇组' as gname
-- union all
--   select '五个外包' as a_name, '传奇捕峰人' as b_name, 13 as a_score, 6 as b_score, '炙热沙城Ⅱ' as map, '2026-07-14' as scheduled_at, '传奇组' as gname
-- ) x
-- join public.groups g on g.name = x.gname
-- join public.stages s
--   on s.name = '排位赛 · 4轮BO1'
--  and s.event_id = (select id from public.events where status in ('signup','running') order by edition desc limit 1)
--  and s.group_id = g.id
-- join public.teams ta on ta.name = x.a_name
-- join public.teams tb on tb.name = x.b_name
-- where not exists (
--   select 1 from public.matches m
--   where m.stage_id = s.id
--     and ((m.team_a_id = ta.id and m.team_b_id = tb.id)
--       or (m.team_a_id = tb.id and m.team_b_id = ta.id))
-- );
