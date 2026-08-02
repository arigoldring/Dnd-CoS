--removing pervious campaigns that didnt have a tracker yet, 
delete from campaigns where id in (
  'bb9ed53a-3b1b-467c-ae3a-c1a4278cd40b',  
  'd8e5ab6d-b483-453f-8903-807b223673b8'   
);

