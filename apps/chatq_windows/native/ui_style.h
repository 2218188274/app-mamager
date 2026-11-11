#pragma once
#include <windows.h>

// Quiet surfaces, real ChatQ accent. See docs/UNSLOP-UI.md for design attribution.
namespace chatq::ui {
constexpr COLORREF Page=RGB(246,247,250),Surface=RGB(255,255,255),Raised=RGB(238,240,245),Hover=RGB(225,229,238);
constexpr COLORREF Ink=RGB(32,37,54),Secondary=RGB(77,86,109),Muted=RGB(95,105,126),Line=RGB(216,221,232);
constexpr COLORREF Accent=RGB(79,85,167),AccentHover=RGB(66,72,143);
inline void SurfaceRect(HDC dc,RECT rect,COLORREF fill,COLORREF stroke,int radius) {
    HBRUSH brush=CreateSolidBrush(fill);HPEN pen=CreatePen(PS_SOLID,1,stroke);
    auto oldBrush=SelectObject(dc,brush),oldPen=SelectObject(dc,pen);
    RoundRect(dc,rect.left,rect.top,rect.right,rect.bottom,radius*2,radius*2);
    SelectObject(dc,oldPen);SelectObject(dc,oldBrush);DeleteObject(pen);DeleteObject(brush);
}
}
