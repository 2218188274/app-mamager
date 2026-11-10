#pragma once
#include <windows.h>

// Quiet surfaces, real ChatQ accent. See docs/UNSLOP-UI.md for design attribution.
namespace chatq::ui {
constexpr COLORREF Page=RGB(250,250,250),Surface=RGB(255,255,255),Raised=RGB(244,244,245),Hover=RGB(236,236,239);
constexpr COLORREF Ink=RGB(35,35,43),Secondary=RGB(82,82,91),Muted=RGB(113,113,122),Line=RGB(228,228,231);
constexpr COLORREF Accent=RGB(112,84,200),AccentHover=RGB(97,67,184);
inline void SurfaceRect(HDC dc,RECT rect,COLORREF fill,COLORREF stroke,int radius) {
    HBRUSH brush=CreateSolidBrush(fill);HPEN pen=CreatePen(PS_SOLID,1,stroke);
    auto oldBrush=SelectObject(dc,brush),oldPen=SelectObject(dc,pen);
    RoundRect(dc,rect.left,rect.top,rect.right,rect.bottom,radius*2,radius*2);
    SelectObject(dc,oldPen);SelectObject(dc,oldBrush);DeleteObject(pen);DeleteObject(brush);
}
}
