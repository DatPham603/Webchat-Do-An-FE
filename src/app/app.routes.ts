import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ChatComponent } from './chat/chat.component'; // Import ChatComponent
import { AppComponent } from './app.component'; // Import AppComponent
import { NgModule } from '@angular/core';

export const routes: Routes = [
  { path: 'home', component: AppComponent }, // Sửa đổi nếu cần
  { path: 'login', component: LoginComponent },
  { path: 'chat', component: ChatComponent }, // Thêm route cho ChatComponent
  { path: '', redirectTo: '/login', pathMatch: 'full' } // Thêm route mặc định (tùy chọn)
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }