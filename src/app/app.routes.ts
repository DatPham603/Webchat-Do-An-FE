import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ChatComponent } from './chat/chat.component'; // Import ChatComponent
import { AppComponent } from './app.component'; // Import AppComponent
import { NgModule } from '@angular/core';
import { UserProfileComponent } from './chat/user-profile/user-profile.component';
import { FriendProfileComponent } from './chat/friendProfile/friend-profile.component';
import { RegisterComponent } from './register/register.component';

export const routes: Routes = [
  { path: 'home', component: AppComponent }, 
  { path: 'login', component: LoginComponent },
  { path: 'chat', component: ChatComponent },
  // {path: 'user-infor', component: UserProfileComponent },
    { path: 'register', component: RegisterComponent }, 
  { path: '', redirectTo: '/login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }